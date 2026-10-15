import test from "node:test";
import assert from "node:assert/strict";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import {
  CHARACTER_ART,
  PLATFORM_ART,
  placeCharacterLayer,
} from "../src/render/CharacterArt.ts";
import { Game } from "../src/engine/Game.ts";

function layer(width: number, height: number, backHair = false): Sprite {
  const sprite = new Sprite(
    new Texture({ source: new TextureSource({ width, height }) }),
  );
  placeCharacterLayer(sprite, backHair);
  return sprite;
}

function visibleFeet(sprite: Sprite) {
  const bounds = sprite.getLocalBounds();
  return sprite.toGlobal({
    x:
      bounds.minX +
      (CHARACTER_ART.footX / CHARACTER_ART.width) * (bounds.maxX - bounds.minX),
    y:
      bounds.minY +
      (CHARACTER_ART.footY / CHARACTER_ART.height) *
        (bounds.maxY - bounds.minY),
  });
}

test("real Pixi sprites keep the SVG soles at the origin for different raster sizes and facing directions", () => {
  const art = CHARACTER_ART;
  for (const [width, height] of [
    [160, 200],
    [120, 150],
    [320, 400],
  ])
    for (const facing of [-1, 1])
      for (const hair of [false, true]) {
        const root = new Container();
        root.position.set(400, 650);
        root.scale.x = facing;
        const sprite = layer(width, height, hair);
        root.addChild(sprite);
        const feet = visibleFeet(sprite);
        assert.ok(
          Math.abs(feet.x - 400) < 1e-6,
          `foot X at ${width}x${height}`,
        );
        assert.ok(
          Math.abs(feet.y - 650) < 1e-6,
          `foot Y at ${width}x${height}`,
        );
        assert.ok(Math.abs(sprite.width - art.width * art.scale) < 1e-6);
        root.destroy({ children: true, texture: true, textureSource: true });
      }
});

test("descending feet and the visible marble surface meet at the same screen Y after landing", () => {
  const g = new Game({ autoJump: false, random: () => 0.5, viewHeight: 1493 });
  g.start();
  g.hazardTimer = 999;
  g.platforms = [{ id: 0, x: 420, baseX: 420, y: 550, w: 160, moving: false }];
  Object.assign(g.player, {
    x: 420,
    y: 540,
    prevX: 420,
    prevY: 540,
    vy: 800,
    grounded: false,
    groundId: null,
  });
  g.step(1 / 30, {});
  assert.equal(g.player.grounded, true);
  const character = new Container();
  character.position.set(g.player.x, g.player.y - g.cameraY);
  const sprite = layer(120, 150);
  character.addChild(sprite);
  const feet = visibleFeet(sprite);
  const platformTop =
    g.platforms[0].y -
    g.cameraY -
    (PLATFORM_ART.surfaceY * PLATFORM_ART.displayHeight) / PLATFORM_ART.height;
  const surface =
    platformTop +
    (PLATFORM_ART.surfaceY * PLATFORM_ART.displayHeight) / PLATFORM_ART.height;
  assert.ok(Math.abs(feet.y - surface) < 1e-6);
  character.destroy({ children: true, texture: true, textureSource: true });
});

import { createSceneLayers } from "../src/render/SceneLayers.ts";
test("gameplay is above transparent effects and ordinary scenery", () => {
  const { root, background, effects, gameplay } = createSceneLayers();
  const actor = new Container();
  gameplay.addChild(actor);
  assert.equal(background.parent, root);
  assert.equal(gameplay.parent, root);
  assert.ok(root.getChildIndex(background) < root.getChildIndex(effects));
  assert.ok(root.getChildIndex(effects) < root.getChildIndex(gameplay));
  assert.equal(actor.parent, gameplay);
  assert.ok(!background.children.includes(actor));
  assert.ok(!root.filters);
  assert.ok(!gameplay.filters);
  root.destroy({ children: true });
});

import { DamagePulse } from "../src/render/DamagePulse.ts";
import { createDamageGlitch, damageBars } from "../src/render/DamageGlitch.ts";
test("damage graphics use bounded real alpha, contain no filter and clear after impact", () => {
  const effect = createDamageGlitch();
  for (const strength of [1, 0.5, 4, -1, Number.NaN, 0]) {
    effect.render(strength, 840, 1493, 2, false);
    assert.ok(effect.view.alpha >= 0 && effect.view.alpha <= 0.42);
    assert.ok(!effect.view.filters);
  }
  effect.render(1, 840, 1493, 2, true);
  assert.equal(effect.view.visible, false);
  effect.render(1, 840, 1493, 2, false);
  assert.equal(effect.view.visible, true);
  effect.clear();
  assert.equal(effect.view.alpha, 0);
  assert.equal(effect.view.visible, false);
  effect.view.destroy();
});

test("transparent glitch geometry covers under three percent and never fills the screen or center", () => {
  for (const ratio of [3 / 4, 9 / 16, 9 / 20])
    for (const time of [0, 0.1, 0.3, 12]) {
      const width = 840,
        height = width / ratio,
        bars = damageBars(width, height, time);
      const area = bars.reduce((n, b) => n + b.width * b.height, 0);
      assert.ok(area < width * height * 0.03);
      for (const b of bars) {
        assert.ok(
          b.x >= 0 &&
            b.x + b.width <= width &&
            b.y >= 0 &&
            b.y + b.height <= height,
        );
        assert.ok(b.height <= 8 && b.width <= width * 0.28);
        assert.ok(b.x + b.width < width * 0.4 || b.x > width * 0.6);
      }
    }
});

test("mobile glitch retains visible thickness and opacity for the first 100ms", () => {
  const effect = createDamageGlitch();
  const pulse = new DamagePulse();
  pulse.trigger();
  const strength = pulse.advance(0.08, false);
  effect.render(strength, 840, 1493, 0.08, false);
  assert.ok(effect.view.alpha >= 0.4);
  const bars = damageBars(840, 1493, 0.08);
  assert.ok(bars.some((b) => (b.height * 350) / 840 >= 3));
  assert.ok(bars.some((b) => (b.width * 350) / 840 >= 80));
  assert.ok(pulse.advance(0.22, false) > 0);
  assert.equal(pulse.advance(1, false), 0);
  effect.view.destroy();
});

import { fitGameFrame, resizedCamera } from "../src/ui/viewport.ts";
test("iPhone visual viewports fit the complete card including HUD and safe areas", () => {
  for (const [width, height, top, bottom] of [
    [320, 454, 0, 0],
    [375, 548, 0, 0],
    [390, 664, 47, 34],
    [393, 759, 59, 34],
    [430, 745, 59, 34],
  ]) {
    for (const header of [0, 64]) {
      const availableWidth = width - 12,
        availableHeight = height - header - top - bottom - 10;
      const frame = fitGameFrame(availableWidth, availableHeight, 18, 163);
      assert.ok(frame.cardWidth <= availableWidth + 0.001);
      assert.ok(frame.cardHeight <= availableHeight + 0.001);
      assert.ok(frame.canvasWidth > 100 && frame.canvasHeight > 150);
      assert.ok(frame.ratio >= 9 / 20 && frame.ratio <= 3 / 4);
      assert.ok(
        Math.abs(frame.canvasWidth / frame.canvasHeight - frame.ratio) < 1e-8,
      );
    }
  }
});
test("Safari toolbar expansion and rotation keep the player inside the camera", () => {
  let camera = -800,
    height = 1600;
  const playerY = 180;
  for (const next of [1120, 1867, 740, 1493]) {
    camera = resizedCamera(playerY, camera, height, next);
    assert.ok(playerY - camera > next * 0.19 && playerY - camera < next * 0.89);
    height = next;
  }
});
