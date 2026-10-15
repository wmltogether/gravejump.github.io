import * as PIXI from "pixi.js";
import { C } from "../engine/config.ts";
import type { Game } from "../engine/Game.ts";
import type {
  Platform,
  FallingHazard,
  Pickup,
  HazardKind,
  Penguin,
} from "../engine/types.ts";
import { createDamageGlitch } from "./DamageGlitch.ts";
import { DamagePulse } from "./DamagePulse.ts";
import { createSceneLayers } from "./SceneLayers.ts";
import {
  CHARACTER_ART,
  PLATFORM_ART,
  placeCharacterLayer,
} from "./CharacterArt.ts";

export interface SceneRenderer {
  render(dt: number): void;
  resize(): void;
  clear(): void;
  burst(x: number, y: number, color: number, count?: number): void;
  hit(): void;
}
interface Particle {
  sprite: PIXI.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** SVG art and screen effects are isolated from the fixed-step simulation. */
export async function createSceneRenderer(
  app: PIXI.Application,
  game: Game,
): Promise<SceneRenderer> {
  const names = [
    "hall-wall",
    "hall-stage",
    "platform",
    "note",
    "cucumber",
    "rocket",
    "penguin",
    "bassist-back",
    "bassist-body",
    "bassist-fringe",
    "hazard-rock",
    "hazard-statue",
    "hazard-cross",
  ] as const;
  const textures = await Promise.all(
    names.map((name) =>
      PIXI.Assets.load<PIXI.Texture>({
        src: `${name}.svg`,
        data: name.startsWith("bassist-")
          ? { width: CHARACTER_ART.width, height: CHARACTER_ART.height }
          : name === "hazard-rock"
            ? { width: 64, height: 64, resolution: 2 }
            : {},
      }),
    ),
  );
  const texture = Object.fromEntries(
    names.map((name, i) => [name, textures[i]]),
  ) as Record<(typeof names)[number], PIXI.Texture>;
  const {
    root: world,
    background: scenery,
    effects,
    gameplay,
  } = createSceneLayers();
  const wall = new PIXI.TilingSprite({
    texture: texture["hall-wall"],
    width: C.WIDTH,
    height: game.viewHeight,
  });
  const stage = new PIXI.Sprite(texture["hall-stage"]);
  stage.width = C.WIDTH;
  stage.height = 420;
  const music = new PIXI.Graphics(),
    objects = new PIXI.Container(),
    particlesLayer = new PIXI.Container(),
    warnings = new PIXI.Graphics();
  const character = new PIXI.Container(),
    aura = new PIXI.Graphics(),
    boostTrail = new PIXI.Graphics();
  const booster = new PIXI.Sprite(texture.rocket);
  booster.anchor.set(0.5, 1);
  booster.width = 34;
  booster.height = 48;
  booster.visible = false;
  scenery.addChild(wall, stage, music);
  gameplay.addChild(
    objects,
    boostTrail,
    booster,
    aura,
    character,
    particlesLayer,
    warnings,
  );
  app.stage.addChild(world);
  const back = new PIXI.Sprite(texture["bassist-back"]);
  const body = new PIXI.Sprite(texture["bassist-body"]);
  const fringe = new PIXI.Sprite(texture["bassist-fringe"]);
  for (const sprite of [back, body, fringe]) {
    placeCharacterLayer(sprite, sprite === back);
    character.addChild(sprite);
  }
  const platformViews = new Map<Platform, PIXI.Sprite>();
  const hazardViews = new Map<FallingHazard, PIXI.Sprite>();
  const noteViews = new Map<Pickup, PIXI.Sprite>();
  const penguinViews = new Map<Penguin, PIXI.Sprite>();
  const particles: Particle[] = [];
  const damageArt = createDamageGlitch();
  effects.addChild(damageArt.view);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const damage = new DamagePulse();
  let time = 0;

  function sync<T>(
    items: T[],
    views: Map<T, PIXI.Sprite>,
    create: (item: T) => PIXI.Sprite,
    update: (view: PIXI.Sprite, item: T) => void,
  ): void {
    const alive = new Set(items);
    for (const [item, view] of views)
      if (!alive.has(item)) {
        view.destroy();
        views.delete(item);
      }
    for (const item of items) {
      let view = views.get(item);
      if (!view) {
        view = create(item);
        objects.addChild(view);
        views.set(item, view);
      }
      update(view, item);
    }
  }

  /** Each ten-floor tier adds another persistent layer to the abandoned concert. */
  function drawMusic(): void {
    music.clear();
    const tier = game.musicTier,
      h = game.viewHeight;
    if (!tier) return;
    const phase = reduced ? 0 : time;
    if (tier >= 3)
      for (let i = 0; i < 3; i++) {
        const x = 120 + i * 300,
          sway = Math.sin(phase * 0.45 + i) * 180;
        music
          .poly([x, -30, x + sway - 145, h, x + sway + 145, h])
          .fill({ color: i % 2 ? 0xcdb1ed : 0xb9e9b5, alpha: 0.045 });
      }
    for (let i = 0; i < Math.min(7 + tier, 18); i++) {
      const x = 50 + ((i * 137) % 740),
        y = ((i * 193 + phase * 17) % (h + 100)) - 50;
      music.ellipse(x, y, 6, 4).fill({ color: 0xcce5a9, alpha: 0.25 });
      music
        .moveTo(x + 5, y)
        .lineTo(x + 5, y - 23)
        .lineTo(x + 14, y - 18)
        .stroke({ color: 0xcce5a9, width: 2, alpha: 0.25 });
    }
    if (tier >= 2)
      for (let i = 0; i < 18; i++) {
        const bar = 14 + Math.abs(Math.sin(phase * 2.2 + i * 0.8)) * 55;
        music
          .roundRect(17, h - 40 - i * 27, 4 + bar * 0.25, 5, 2)
          .fill({ color: 0xbee1a6, alpha: 0.22 });
        music
          .roundRect(
            C.WIDTH - 21 - bar * 0.25,
            h - 40 - i * 27,
            4 + bar * 0.25,
            5,
            2,
          )
          .fill({ color: 0xd6b9ed, alpha: 0.22 });
      }
    if (tier >= 4)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 5; i++)
          music
            .moveTo(50, 160 + j * 500 + i * 11)
            .bezierCurveTo(
              260,
              110 + j * 500 + i * 11,
              560,
              220 + j * 500 + i * 11,
              790,
              155 + j * 500 + i * 11,
            )
            .stroke({ color: 0xdac6a2, width: 1, alpha: 0.14 });
    if (tier >= 5) {
      music
        .moveTo(420, 0)
        .lineTo(420, 70)
        .stroke({ color: 0xc3b4ca, width: 2, alpha: 0.4 });
      music
        .circle(420, 98, 28)
        .fill({ color: 0xcab7dc, alpha: 0.2 })
        .stroke({ color: 0xe0d1ea, width: 1, alpha: 0.5 });
      for (let i = 0; i < 16; i++) {
        const a = i * 2.4 + phase * 0.08,
          x = 420 + Math.cos(a) * (160 + i * 22),
          y = 100 + Math.abs(Math.sin(a)) * (h - 160);
        music
          .star(x, y, 4, 3 + (i % 3), 1)
          .fill({ color: 0xe7deba, alpha: 0.22 });
      }
    }
  }

  function render(dt: number): void {
    if (game.status !== "paused") time += dt;
    wall.height = game.viewHeight;
    wall.tilePosition.y = -game.cameraY * 0.18;
    stage.y = C.START_FLOOR_Y - game.cameraY - 330;
    drawMusic();
    sync(
      game.platforms,
      platformViews,
      () => new PIXI.Sprite(texture.platform),
      (v, p) => {
        v.width = p.w + 10;
        v.height = PLATFORM_ART.displayHeight;
        v.position.set(
          p.x - v.width / 2,
          p.y -
            game.cameraY -
            (PLATFORM_ART.surfaceY * PLATFORM_ART.displayHeight) /
              PLATFORM_ART.height,
        );
        v.tint = p.moving ? 0xd5c7f2 : 0xffffff;
      },
    );
    sync(
      game.pickups,
      noteViews,
      (n) => {
        const v = new PIXI.Sprite(
          n.kind === "cucumber"
            ? texture.cucumber
            : n.kind === "rocket"
              ? texture.rocket
              : texture.note,
        );
        v.anchor.set(0.5);
        v.width = n.kind === "cucumber" ? 48 : n.kind === "rocket" ? 36 : 39;
        v.height = n.kind === "cucumber" ? 36 : n.kind === "rocket" ? 50 : 39;
        return v;
      },
      (v, n) => {
        v.position.set(
          n.x,
          n.y - game.cameraY + (reduced ? 0 : Math.sin(time * 3 + n.id) * 5),
        );
      },
    );
    sync(
      game.hazards,
      hazardViews,
      (h) => {
        const kind: HazardKind = h.kind ?? "rock";
        const v = new PIXI.Sprite(texture[`hazard-${kind}`]);
        v.anchor.set(0.5);
        v.width = h.r * (kind === "rock" ? 2 : kind === "statue" ? 1.8 : 1.65);
        v.height = h.r * (kind === "rock" ? 2 : kind === "statue" ? 2.4 : 2.2);
        return v;
      },
      (v, h) => {
        v.position.set(h.x, h.y - game.cameraY);
        v.rotation = h.rotation;
      },
    );
    sync(
      game.penguins,
      penguinViews,
      () => {
        const v = new PIXI.Sprite(texture.penguin);
        v.anchor.set(0.5, 66 / 72);
        v.width = 44;
        v.height = 50;
        return v;
      },
      (v, e) => {
        v.position.set(e.x, e.y - game.cameraY);
        v.scale.x = Math.abs(v.scale.x) * (game.player.x < e.x ? -1 : 1);
        v.rotation = !reduced && e.throwTimer < 0.3 ? -0.12 : 0;
      },
    );
    const p = game.player;
    booster.visible = game.rocketTime > 0;
    booster.position.set(p.x - 24, p.y - game.cameraY + 8);
    boostTrail.clear();
    if (game.rocketTime > 0) {
      const y = p.y - game.cameraY,
        length = reduced ? 44 : 44 + Math.sin(time * 24) * 10;
      boostTrail
        .poly([
          p.x - 12,
          y,
          p.x - 16,
          y + 22,
          p.x,
          y + length,
          p.x + 16,
          y + 22,
          p.x + 12,
          y,
        ])
        .fill({ color: 0xffa46e, alpha: 0.8 });
      boostTrail
        .poly([p.x - 6, y, p.x, y + length * 0.7, p.x + 6, y])
        .fill(0xffe6a7);
      if (!reduced)
        for (let i = 0; i < 6; i++) {
          const x = p.x + (i % 2 ? 1 : -1) * (34 + i * 8),
            trailY = y + ((time * 240 + i * 24) % 130);
          boostTrail
            .moveTo(x, trailY)
            .lineTo(x, trailY + 18)
            .stroke({ color: 0xa8e6e4, width: 2, alpha: 0.35 });
        }
    }
    character.position.set(p.x, p.y - game.cameraY);
    character.scale.set(p.facing, 1);
    // Feet stay level on contact; tilt is only an airborne pose.
    character.rotation = reduced || p.grounded ? 0 : p.vx * 0.00016;
    back.rotation = reduced ? 0 : Math.sin(time * 5) * 0.025 - p.vx * 0.0001;
    // Slow, soft protection pulse; no visibility flicker that hides the player.
    character.alpha =
      game.invulnerable > 0 ? 0.94 + 0.06 * Math.sin(time * 8) : 1;
    aura.clear();
    if (game.invulnerable > 0 || game.rocketTime > 0)
      aura
        .ellipse(
          p.x,
          p.y - game.cameraY - (64 * C.PLAYER_SCALE) / 0.74,
          (52 * C.PLAYER_SCALE) / 0.74,
          (78 * C.PLAYER_SCALE) / 0.74,
        )
        .stroke({
          color: game.rocketTime > 0 ? 0x8de6ee : 0xd9e9bd,
          width: 3,
          alpha: 0.55,
        });
    warnings.clear();
    for (const w of game.warnings) {
      const alpha = reduced ? 0.8 : 0.65 + Math.sin(time * 6) * 0.15;
      warnings
        .roundRect(w.x - 22, 16, 44, 46, 11)
        .fill({ color: 0x392535, alpha: 0.95 })
        .stroke({ color: 0xf49ba9, width: 2, alpha });
      warnings
        .moveTo(w.x, 27)
        .lineTo(w.x, 42)
        .stroke({ color: 0xffb6bd, width: 4 });
      warnings.circle(w.x, 50, 2).fill(0xffb6bd);
      for (let y = 75; y < Math.min(game.viewHeight, 270); y += 28)
        warnings
          .moveTo(w.x, y)
          .lineTo(w.x, y + 9)
          .stroke({ color: 0xec97a7, width: 2, alpha: 0.22 });
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const n = particles[i];
      if (game.status !== "paused") {
        n.life -= dt;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.vy += 160 * dt;
      }
      n.sprite.position.set(n.x, n.y - game.cameraY);
      n.sprite.alpha = Math.max(0, n.life / 0.55);
      if (n.life <= 0) {
        n.sprite.destroy();
        particles.splice(i, 1);
      }
    }
    // Damage runs on presentation time even on the final hit or while a menu opens.
    const strength = damage.advance(dt, reduced);
    damageArt.render(strength, C.WIDTH, game.viewHeight, time, reduced);
  }
  return {
    render,
    resize() {
      app.renderer.resize(C.WIDTH, game.viewHeight);
    },
    clear() {
      for (const views of [
        platformViews,
        hazardViews,
        noteViews,
        penguinViews,
      ]) {
        for (const v of views.values()) v.destroy();
        views.clear();
      }
      particles.splice(0).forEach((p) => p.sprite.destroy());
      damage.clear();
      damageArt.clear();
      boostTrail.clear();
      booster.visible = false;
    },
    burst(x, y, color, count = 8) {
      for (let i = 0; i < (reduced ? 3 : count); i++) {
        const sprite = new PIXI.Graphics()
          .circle(0, 0, 2 + Math.random() * 2)
          .fill(color);
        particlesLayer.addChild(sprite);
        particles.push({
          sprite,
          x,
          y,
          vx: (Math.random() - 0.5) * 150,
          vy: -35 - Math.random() * 100,
          life: 0.55,
        });
      }
    },
    hit() {
      damage.trigger();
    },
  };
}
