import { C, approach, clamp } from "./config.ts";
import { hazardHitsPlayer } from "./collision.ts";
import type {
  EndReason,
  FrameInput,
  GameEvent,
  GameOptions,
  GameStatus,
  Pickup,
  Platform,
  Player,
  FallingHazard,
  HazardWarning,
  Penguin,
} from "./types.ts";

/** Pure game simulation. No DOM, PixiJS, audio, storage, or real-time clocks. */
export class Game {
  readonly random: () => number;
  autoJump: boolean;
  viewHeight: number;
  status: GameStatus = "ready";
  reason: EndReason = "";
  time = 0;
  cameraY = 0;
  height = 0;
  notes = 0;
  lives: number = C.MAX_LIVES;
  jumpBuffer = 0;
  coyote = 0;
  hazardTimer = 2.6;
  invulnerable = 0;
  landings = 0;
  floor = 0;
  musicTier = 0;
  rocketTime = 0;
  /** Remaining simulation seconds in which penguins cannot spawn or enter view. */
  penguinSuppressionTime = 0;
  penguins: Penguin[] = [];
  player!: Player;
  platforms: Platform[] = [];
  hazards: FallingHazard[] = [];
  warnings: HazardWarning[] = [];
  pickups: Pickup[] = [];
  private events: GameEvent[] = [];
  private nextPlatformId = 0;

  constructor({
    random = Math.random,
    autoJump = true,
    viewHeight = C.HEIGHT,
  }: GameOptions = {}) {
    this.random = random;
    this.autoJump = autoJump;
    this.viewHeight = viewHeight;
    this.reset();
  }

  reset(): void {
    this.time = 0;
    // Keep the starting floor 90px above the bottom, even in a short desktop viewport.
    this.cameraY = C.HEIGHT - this.viewHeight;
    this.height = this.notes = this.landings = 0;
    this.floor = this.musicTier = 0;
    this.rocketTime = 0;
    this.penguinSuppressionTime = 0;
    this.penguins = [];
    this.lives = C.MAX_LIVES;
    this.status = "ready";
    this.reason = "";
    this.events = [];
    this.jumpBuffer = this.invulnerable = 0;
    this.coyote = C.COYOTE;
    this.hazardTimer = 2.6;
    this.nextPlatformId = 0;
    this.player = {
      x: C.WIDTH / 2,
      y: C.START_FLOOR_Y,
      prevX: C.WIDTH / 2,
      prevY: C.START_FLOOR_Y,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      groundId: 0,
      groundTime: 0,
      manualJump: false,
      minY: C.START_FLOOR_Y,
    };
    this.platforms = [
      {
        id: 0,
        x: C.WIDTH / 2,
        y: C.START_FLOOR_Y,
        w: 230,
        baseX: C.WIDTH / 2,
        moving: false,
      },
    ];
    this.hazards = [];
    this.warnings = [];
    this.pickups = [];
    this.generatePlatforms();
  }

  start(): void {
    this.reset();
    this.status = "playing";
  }

  pause(): void {
    if (this.status === "playing") this.status = "paused";
    else if (this.status === "paused") this.status = "playing";
    this.jumpBuffer = 0;
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0);
  }

  step(seconds: number, input: FrameInput = {}): void {
    if (this.status !== "playing") return;
    const dt = clamp(seconds, 0, 1 / 30);
    if (dt === 0) return;
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.penguinSuppressionTime = Math.max(0, this.penguinSuppressionTime - dt);
    if (this.penguinSuppressionTime < 1e-8) this.penguinSuppressionTime = 0;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (input.jumpPressed) this.jumpBuffer = C.BUFFER;

    const player = this.player;
    player.prevX = player.x;
    player.prevY = player.y;
    this.moveHorizontally(dt, input);
    this.movePlatforms(dt);
    if (this.penguinSuppressionTime > 0) this.purgeVisiblePenguins();
    this.updatePenguins(dt);
    const rocketAtStepStart = this.rocketTime > 0;
    if (rocketAtStepStart) this.moveWithRocket(dt, input);
    else {
      this.updateGrounding(dt);

      if (this.jumpBuffer > 0 && (player.grounded || this.coyote > 0))
        this.jump(true);
      else if (
        this.autoJump &&
        player.grounded &&
        player.groundTime >= C.AUTO_DELAY
      )
        this.jump(false);

      if (!player.grounded) this.moveVertically(dt, input);
    }
    this.updateCameraAndHeight();
    this.generatePlatforms();
    this.collectPickups();
    // Includes pre-generated enemies revealed by upward camera movement this step.
    if (this.penguinSuppressionTime > 0) this.purgeVisiblePenguins();
    this.updateHazards(dt, rocketAtStepStart || this.rocketTime > 0);
    this.removeOffscreenObjects();

    if (
      this.status === "playing" &&
      player.y - this.cameraY > this.viewHeight + 105
    )
      this.finish("fall");
  }

  private moveHorizontally(dt: number, input: FrameInput): void {
    const player = this.player;
    const direction =
      Number(Boolean(input.right)) - Number(Boolean(input.left));
    const acceleration = direction ? C.ACCEL : C.ACCEL * 1.25;
    player.vx = approach(
      player.vx,
      direction * C.MOVE_SPEED,
      acceleration * dt,
    );
    player.x = clamp(player.x + player.vx * dt, 35, C.WIDTH - 43);
    if (player.vx > 25) player.facing = 1;
    else if (player.vx < -25) player.facing = -1;
  }

  private movePlatforms(_dt: number): void {
    for (const platform of this.platforms) {
      if (!platform.moving) continue;
      const oldX = platform.x;
      platform.x =
        platform.baseX + Math.sin(this.time * 1.2 + (platform.phase ?? 0)) * 27;
      if (this.player.grounded && this.player.groundId === platform.id)
        this.player.x += platform.x - oldX;
    }
  }

  private updateGrounding(dt: number): void {
    const player = this.player;
    if (!player.grounded) {
      this.coyote = Math.max(0, this.coyote - dt);
      return;
    }
    const platform = this.platforms.find((item) => item.id === player.groundId);
    if (!platform || Math.abs(player.x - platform.x) > platform.w / 2 + 14) {
      player.grounded = false;
      player.groundId = null;
      player.groundTime = 0;
      this.coyote = C.COYOTE;
      return;
    }
    player.y = platform.y;
    player.vy = 0;
    player.groundTime += dt;
    this.coyote = C.COYOTE;
  }

  private jump(manual: boolean): void {
    const player = this.player;
    player.vy = -C.JUMP_SPEED;
    player.grounded = false;
    player.groundId = null;
    player.manualJump = manual;
    this.coyote = this.jumpBuffer = 0;
    this.events.push({ type: "jump", x: player.x, y: player.y, manual });
  }

  private moveVertically(dt: number, input: FrameInput): void {
    const player = this.player;
    // Only release a manually initiated jump; automatic hops always have full height.
    if (player.manualJump && input.jumpHeld === false && player.vy < -320) {
      player.vy = -320;
      player.manualJump = false;
    }
    player.vy += C.GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.vy < 0) return; // One-way platforms: upward passage is always allowed.

    const platform = this.findLandingPlatform();
    const enemy = this.findStompedPenguin();
    if (enemy && (!platform || enemy.y - C.PENGUIN_HEIGHT < platform.y)) {
      enemy.alive = false;
      // A stomp wins over a stone being released from this same penguin's hand.
      this.hazards = this.hazards.filter(
        (h) =>
          h.ownerId !== enemy.id ||
          Math.hypot(h.x - enemy.x, h.y - enemy.y) > 56,
      );
      player.y = enemy.y - C.PENGUIN_HEIGHT;
      this.reachFloor(enemy.platformId);
      this.events.push({ type: "stomp", x: enemy.x, y: player.y });
      this.jump(false);
      return;
    }
    if (!platform) return;
    player.y = platform.y;
    player.vy = 0;
    player.grounded = true;
    player.groundId = platform.id;
    player.groundTime = 0;
    this.coyote = C.COYOTE;
    this.landings++;
    this.reachFloor(platform.id);
    this.events.push({ type: "land", x: player.x, y: player.y });
    if (this.jumpBuffer > 0) this.jump(true);
  }

  private reachFloor(id: number): void {
    // Rocket crossings and landings share unique-floor progress.
    this.floor = Math.max(this.floor, id);
    const tier = Math.floor(this.floor / 10);
    if (tier > this.musicTier) {
      this.musicTier = tier;
      this.events.push({ type: "music", tier, floor: this.floor });
    }
  }

  private moveWithRocket(dt: number, input: FrameInput): void {
    const p = this.player,
      boostDt = Math.min(dt, this.rocketTime);
    p.grounded = false;
    p.groundId = null;
    p.manualJump = false;
    this.jumpBuffer = this.coyote = 0;
    p.vy = Math.max(-C.ROCKET_MAX_SPEED, p.vy - C.ROCKET_ACCEL * boostDt);
    p.y += p.vy * boostDt;
    this.rocketTime = Math.max(0, this.rocketTime - boostDt);
    if (this.rocketTime < 1e-8) this.rocketTime = 0;
    for (const platform of this.platforms)
      if (p.prevY >= platform.y && p.y <= platform.y)
        this.reachFloor(platform.id);
    if (this.rocketTime === 0) {
      // A short upward coast gives the player time to choose a landing platform.
      p.vy = -C.JUMP_SPEED * 0.6;
      if (dt > boostDt) this.moveVertically(dt - boostDt, input);
    }
  }

  private findStompedPenguin(): Penguin | null {
    const p = this.player;
    let result: Penguin | null = null;
    for (const enemy of this.penguins) {
      if (!enemy.alive) continue;
      const head = enemy.y - C.PENGUIN_HEIGHT;
      if (p.prevY > head || p.y < head) continue;
      const t = (head - p.prevY) / Math.max(0.001, p.y - p.prevY);
      const crossingX = p.prevX + (p.x - p.prevX) * t;
      if (Math.abs(crossingX - enemy.x) > C.PENGUIN_HALF_WIDTH + 10) continue;
      if (!result || enemy.y < result.y) result = enemy;
    }
    return result;
  }

  private updatePenguins(dt: number): void {
    for (const enemy of this.penguins) {
      if (!enemy.alive) continue;
      const platform = this.platforms.find((p) => p.id === enemy.platformId);
      if (!platform) {
        enemy.alive = false;
        continue;
      }
      enemy.x = platform.x;
      enemy.y = platform.y;
      const screenY = enemy.y - this.cameraY;
      if (screenY < 0 || screenY > this.viewHeight) continue;
      enemy.throwTimer -= dt;
      if (enemy.throwTimer > 0) continue;
      enemy.throwTimer = C.PENGUIN_THROW_SECONDS;
      this.hazards.push({
        kind: "rock",
        source: "penguin",
        ownerId: enemy.id,
        x: enemy.x,
        y: enemy.y - 34,
        prevX: enemy.x,
        prevY: enemy.y - 34,
        vx: clamp((this.player.x - enemy.x) * 0.9, -230, 230),
        vy: clamp((this.player.y - 65 - enemy.y) * 0.55, -260, 140),
        r: 12,
        rotation: 0,
        spin: 2.4,
      });
      this.events.push({ type: "throw", x: enemy.x, y: enemy.y - 34 });
    }
  }

  private findLandingPlatform(): Platform | null {
    const player = this.player;
    let landed: Platform | null = null;
    for (const platform of this.platforms) {
      if (player.prevY > platform.y + 0.01 || player.y < platform.y) continue;
      const crossingFraction =
        (platform.y - player.prevY) / Math.max(0.001, player.y - player.prevY);
      const crossingX =
        player.prevX + (player.x - player.prevX) * crossingFraction;
      if (
        Math.abs(crossingX - platform.x) <= platform.w / 2 + 13 &&
        (!landed || platform.y < landed.y)
      )
        landed = platform;
    }
    return landed;
  }

  private updateCameraAndHeight(): void {
    const player = this.player;
    player.minY = Math.min(player.minY, player.y);
    this.height = Math.max(
      this.height,
      Math.floor((C.START_FLOOR_Y - player.minY) * C.PIXELS_TO_METERS),
    );
    this.cameraY = Math.min(this.cameraY, player.y - this.viewHeight * 0.61);
  }

  private generatePlatforms(): void {
    let last = this.platforms[this.platforms.length - 1];
    while (last.y > this.cameraY - 450) {
      const level = ++this.nextPlatformId;
      const gap = level < 4 ? 104 : 106 + this.random() * 15;
      const width = level < 5 ? 166 : 130 + this.random() * 24;
      const direction = this.random() < 0.5 ? -1 : 1;
      const x = clamp(
        last.x + (75 + this.random() * 105) * direction,
        95,
        C.WIDTH - 95,
      );
      const platform: Platform = {
        id: level,
        x,
        baseX: x,
        y: last.y - gap,
        w: width,
        moving: level > 15 && level % 4 === 0,
        phase: this.random() * Math.PI * 2,
      };
      this.platforms.push(platform);
      if (level % 22 === 6)
        this.pickups.push({
          kind: "rocket",
          id: 100000 + level,
          x,
          y: platform.y - 38,
          collected: false,
        });
      if (level % 9 === 8 && this.penguinSuppressionTime === 0)
        this.penguins.push({
          id: level,
          platformId: level,
          x,
          y: platform.y,
          alive: true,
          throwTimer: 1.2,
        });
      if (level % C.STAR_FLOOR_INTERVAL === C.STAR_FIRST_FLOOR)
        this.pickups.push({
          kind: "star",
          id: 200000 + level,
          x: x + 35,
          y: platform.y - 42,
          collected: false,
        });
      if (level % 3 === 0)
        this.pickups.push({
          kind: "note",
          id: level,
          x,
          y: platform.y - 43,
          collected: false,
        });
      // A recoverable heart every seven floors, visually separated from notes.
      if (level % 7 === 4)
        this.pickups.push({
          kind: "cucumber",
          id: -level,
          x: x + (level % 3 === 0 ? 35 : 0),
          y: platform.y - 31,
          collected: false,
        });
      last = platform;
    }
  }

  private collectPickups(): void {
    const player = this.player;
    for (const item of this.pickups) {
      if (
        item.collected ||
        Math.hypot(
          item.x - player.x,
          item.y - (player.y - (75 * C.PLAYER_SCALE) / 0.74),
        ) >=
          (47 * C.PLAYER_SCALE) / 0.74
      )
        continue;
      item.collected = true;
      if (item.kind === "cucumber") {
        const before = this.lives;
        this.lives = Math.min(C.MAX_LIVES, this.lives + 1);
        this.events.push({
          type: "heal",
          x: item.x,
          y: item.y,
          restored: this.lives - before,
        });
      } else if (item.kind === "star") {
        const restored = C.MAX_LIVES - this.lives;
        this.lives = C.MAX_LIVES;
        this.penguinSuppressionTime = C.STAR_SECONDS;
        this.purgeVisiblePenguins();
        this.events.push({ type: "star", x: item.x, y: item.y, restored });
      } else if (item.kind === "rocket") {
        this.rocketTime = C.ROCKET_SECONDS;
        player.grounded = false;
        player.groundId = null;
        player.groundTime = 0;
        player.manualJump = false;
        player.vy = Math.min(player.vy, -480);
        this.jumpBuffer = this.coyote = 0;
        this.events.push({ type: "rocket", x: item.x, y: item.y });
      } else {
        this.notes++;
        this.events.push({ type: "note", x: item.x, y: item.y });
      }
    }
  }

  private purgeVisiblePenguins(): void {
    const killed = new Set<number>();
    for (const enemy of this.penguins) {
      if (
        !enemy.alive ||
        enemy.x + C.PENGUIN_DRAW_WIDTH / 2 < 0 ||
        enemy.x - C.PENGUIN_DRAW_WIDTH / 2 > C.WIDTH ||
        enemy.y + C.PENGUIN_DRAW_HEIGHT * (1 - C.PENGUIN_DRAW_ANCHOR_Y) <
          this.cameraY ||
        enemy.y - C.PENGUIN_DRAW_HEIGHT * C.PENGUIN_DRAW_ANCHOR_Y >
          this.cameraY + this.viewHeight
      )
        continue;
      enemy.alive = false;
      killed.add(enemy.id);
      this.events.push({
        type: "purge",
        x: enemy.x,
        y: enemy.y - C.PENGUIN_HEIGHT / 2,
      });
    }
    // Clear attacks from defeated penguins, including stones thrown on this step.
    if (killed.size)
      this.hazards = this.hazards.filter(
        (hazard) =>
          hazard.source !== "penguin" || !killed.has(hazard.ownerId ?? -1),
      );
  }

  private updateHazards(dt: number, rocketProtected = false): void {
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) this.scheduleHazard();
    for (let index = this.warnings.length - 1; index >= 0; index--) {
      const warning = this.warnings[index];
      warning.remaining -= dt;
      if (warning.remaining > 0) continue;
      this.hazards.push({
        kind: warning.kind ?? "rock",
        x: warning.x,
        y: this.cameraY - 45,
        prevX: warning.x,
        prevY: this.cameraY - 45,
        vy: 175 + Math.min(130, this.height * 0.06),
        r: warning.r,
        rotation: this.random() * Math.PI * 2,
        spin: (this.random() - 0.5) * (warning.kind === "rock" ? 2 : 0.55),
      });
      this.warnings.splice(index, 1);
      this.events.push({ type: "hazard" });
    }
    for (const rock of this.hazards) {
      rock.prevX = rock.x;
      rock.prevY = rock.y;
      rock.prevRotation = rock.rotation;
      rock.x += (rock.vx ?? 0) * dt;
      rock.vy += (rock.source === "penguin" ? 420 : C.ROCK_GRAVITY) * dt;
      rock.y += rock.vy * dt;
      rock.rotation += rock.spin * dt;
      if (
        rock.hit ||
        this.invulnerable > 0 ||
        rocketProtected ||
        !hazardHitsPlayer(rock, this.player)
      )
        continue;
      this.takeHazardHit(rock);
      if (this.status === "over") return;
    }
  }

  private scheduleHazard(): void {
    const aimed = this.random() < 0.6;
    const proposedX = aimed
      ? this.player.x + (this.random() - 0.5) * 180
      : 45 + this.random() * (C.WIDTH - 90);
    this.warnings.push({
      kind: (["rock", "statue", "cross"] as const)[
        Math.floor(this.random() * 3)
      ],
      x: clamp(proposedX, 45, C.WIDTH - 45),
      remaining: C.ROCK_WARNING_SECONDS,
      r: 16 + this.random() * 11,
      id: this.time,
    });
    this.hazardTimer =
      Math.max(0.86, 2.1 - this.height / 1300) + this.random() * 0.7;
  }

  private takeHazardHit(rock: FallingHazard): void {
    rock.hit = true;
    this.lives--;
    this.invulnerable = C.INVULNERABLE;
    this.player.vx = (this.player.x < rock.x ? -1 : 1) * 180;
    this.events.push({
      type: "hit",
      x: this.player.x,
      y: this.player.y - (85 * C.PLAYER_SCALE) / 0.74,
    });
    if (this.lives <= 0) this.finish("hazards");
  }

  private removeOffscreenObjects(): void {
    const bottom = this.cameraY + this.viewHeight;
    this.platforms = this.platforms.filter((item) => item.y < bottom + 180);
    this.pickups = this.pickups.filter(
      (item) => !item.collected && item.y < bottom + 150,
    );
    this.hazards = this.hazards.filter(
      (item) =>
        item.y < bottom + 80 &&
        item.x > -80 &&
        item.x < C.WIDTH + 80 &&
        !item.hit,
    );
    this.penguins = this.penguins.filter((e) => e.alive && e.y < bottom + 180);
  }

  private finish(reason: EndReason): void {
    this.status = "over";
    this.reason = reason;
    this.events.push({ type: "over", reason, height: this.height });
  }
}
