import test from "node:test";
import assert from "node:assert/strict";
import {
  C,
  Game,
  FrameRunner,
  hazardHitsPlayer,
  sweepRoundedRect,
} from "../src/engine/index.ts";
import type { FrameInput } from "../src/engine/types.ts";
const dt = C.FIXED_DT;
function seeded(seed = 8) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function game(autoJump = false) {
  const g = new Game({ random: seeded(), autoJump });
  g.start();
  g.hazardTimer = 999;
  return g;
}
function steps(g: Game, n: number, input: FrameInput = {}) {
  for (let i = 0; i < n; i++) g.step(dt, input);
}
function airborne(g: Game, x = 420, y = 600, vy = 250) {
  Object.assign(g.player, {
    x,
    y,
    prevX: x,
    prevY: y,
    vy,
    grounded: false,
    groundId: null,
    manualJump: false,
  });
  g.coyote = 0;
}

function eatStar(g: Game) {
  g.pickups = [
    {
      kind: "star",
      id: 900002,
      x: g.player.x,
      y: g.player.y - (75 * C.PLAYER_SCALE) / 0.74,
      collected: false,
    },
  ];
  g.step(dt);
}

test("golden star heals to five, clears even partly visible penguins and their stones exactly once", () => {
  const g = game();
  g.lives = 1;
  const positions = [
    { x: 200, y: 400 },
    { x: 300, y: -3 },
    { x: 600, y: g.viewHeight + 44 },
    { x: 700, y: -100 },
    { x: -100, y: 400 },
  ];
  g.penguins = positions.map((p, i) => ({
    id: 900 + i,
    platformId: 900 + i,
    ...p,
    alive: true,
    facing: 1 as const,
    throwTimer: 0,
  }));
  g.platforms.push(
    ...positions.map((p, i) => ({
      id: 900 + i,
      ...p,
      baseX: p.x,
      w: 150,
      moving: false,
    })),
  );
  g.hazards = [
    {
      source: "penguin",
      ownerId: 900,
      x: 100,
      y: 200,
      vy: 0,
      r: 12,
      rotation: 0,
      spin: 0,
    },
    { source: "sky", x: 120, y: 200, vy: 0, r: 12, rotation: 0, spin: 0 },
  ];
  eatStar(g);
  assert.equal(g.lives, 5);
  assert.equal(g.penguinSuppressionTime, 10);
  assert.deepEqual(
    g.penguins.filter((e) => e.id >= 900).map((e) => e.id),
    [903, 904],
  );
  assert.ok(g.hazards.every((h) => h.source !== "penguin"));
  assert.ok(g.hazards.some((h) => h.source === "sky"));
  assert.equal(
    g.pickups.some((p) => p.id === 900002),
    false,
  );
  const events = g.drainEvents();
  assert.equal(events.filter((e) => e.type === "purge").length, 3);
  assert.equal(events.filter((e) => e.type === "star").length, 1);
  assert.ok(events.some((e) => e.type === "star" && e.restored === 4));
  g.step(dt);
  assert.equal(
    g.drainEvents().some((e) => e.type === "star"),
    false,
  );
});

test("star lasts exactly ten active seconds, consumes at full health and refreshes without stacking", () => {
  const g = game();
  eatStar(g);
  assert.equal(g.lives, 5);
  steps(g, 120);
  assert.ok(Math.abs(g.penguinSuppressionTime - 9) < 1e-8);
  g.pause();
  steps(g, 240);
  assert.ok(Math.abs(g.penguinSuppressionTime - 9) < 1e-8);
  g.pause();
  eatStar(g);
  assert.equal(g.penguinSuppressionTime, 10);
  steps(g, 1199);
  assert.ok(g.penguinSuppressionTime > 0);
  g.step(dt);
  assert.equal(g.penguinSuppressionTime, 0);
  eatStar(g);
  g.start();
  assert.equal(g.penguinSuppressionTime, 0);
});

test("star suppresses newly generated penguins and normal generation resumes after expiry", () => {
  const g = game();
  eatStar(g);
  g.pickups = [];
  g.cameraY = -2000;
  airborne(g, 420, -1600, 0);
  const oldHighest = Math.max(...g.platforms.map((p) => p.id));
  g.step(dt);
  const newPlatforms = g.platforms.filter(
    (p) => p.id > oldHighest && p.id % 9 === 8,
  );
  assert.ok(newPlatforms.length > 0);
  assert.ok(
    newPlatforms.every((p) => !g.penguins.some((e) => e.platformId === p.id)),
  );
  g.penguinSuppressionTime = dt;
  g.cameraY = -4000;
  airborne(g, 420, -3600, 0);
  g.step(dt);
  assert.equal(g.penguinSuppressionTime, 0);
  assert.ok(g.penguins.length > 0);
});

test("pre-generated offscreen penguins cannot enter view during the star effect", () => {
  const g = game();
  g.platforms.push({
    id: 900,
    x: 220,
    baseX: 220,
    y: -100,
    w: 150,
    moving: false,
  });
  g.penguins = [
    {
      id: 900,
      platformId: 900,
      x: 220,
      y: -100,
      alive: true,
      facing: 1,
      throwTimer: 0,
    },
  ];
  eatStar(g);
  assert.equal(g.penguins.length, 1);
  g.cameraY = -200;
  g.step(dt);
  assert.equal(g.penguins.length, 0);
  assert.equal(
    g.hazards.some((h) => h.ownerId === 900),
    false,
  );
});

test("golden stars spawn on platforms every thirty floors starting at floor twelve", () => {
  const g = new Game({ random: seeded(), autoJump: false, viewHeight: 8000 });
  g.start();
  const stars = g.pickups.filter((p) => p.kind === "star");
  assert.ok(stars.length >= 2);
  for (const star of stars) {
    const platform = g.platforms.find((p) => p.id === star.id - 200000)!;
    assert.ok(platform);
    assert.equal(platform.id % 30, 12);
    assert.ok(Math.abs(star.x - platform.x) < platform.w / 2);
    assert.equal(star.y, platform.y - 42);
  }
});
test("30/60/120/144 Hz render rates produce identical physics and RNG progression", () => {
  const results = [];
  for (const fps of [30, 60, 120, 144]) {
    const g = game(true),
      runner = new FrameRunner(g);
    for (let i = 0; i < fps * 2; i++)
      runner.advance(1 / fps, { right: i < fps * 0.5 });
    results.push({
      x: g.player.x,
      y: g.player.y,
      height: g.height,
      time: g.time,
      hazards: g.hazards.length,
    });
  }
  for (const r of results.slice(1)) {
    for (const key of ["x", "y", "time"] as const)
      assert.ok(
        Math.abs(r[key] - results[0][key]) < 1e-6,
        `${key}: ${r[key]} != ${results[0][key]}`,
      );
    assert.equal(r.height, results[0].height);
  }
});
test("jump press survives a render frame with zero physics substeps and is consumed once", () => {
  const g = game(),
    r = new FrameRunner(g);
  r.advance(0.001, { jumpPressed: true, jumpHeld: true });
  assert.equal(g.player.grounded, true);
  r.advance(dt, { jumpHeld: true });
  assert.ok(g.player.vy < 0);
  assert.equal(g.drainEvents().filter((e) => e.type === "jump").length, 1);
  steps(g, 3, { jumpHeld: true });
  assert.equal(g.drainEvents().filter((e) => e.type === "jump").length, 0);
});
test("press within 150 ms before landing is buffered and jumps on the landing step", () => {
  const g = game();
  airborne(g, 420, 631, 240);
  g.step(dt, { jumpPressed: true, jumpHeld: true });
  steps(g, 12, { jumpHeld: true });
  assert.ok(g.player.vy < 0);
  assert.ok(g.drainEvents().some((e) => e.type === "land"));
  assert.equal(g.jumpBuffer, 0);
});
test("expired jump buffer never causes a late unsolicited jump", () => {
  const g = game();
  airborne(g, 420, 450, 0);
  g.step(dt, { jumpPressed: true, jumpHeld: true });
  steps(g, 80, { jumpHeld: true });
  assert.equal(g.player.grounded, true);
  assert.equal(g.player.y, 650);
  assert.equal(g.drainEvents().filter((e) => e.type === "jump").length, 0);
});
test("coyote jump succeeds 75 ms after stepping off a platform", () => {
  const g = game();
  g.player.x = 560;
  g.step(dt, {});
  assert.equal(g.player.grounded, false);
  steps(g, 8, {});
  g.step(dt, { jumpPressed: true, jumpHeld: true });
  assert.ok(g.player.vy < -700);
  assert.equal(g.coyote, 0);
});
test("coyote jump is rejected after 110 ms and cannot become an air jump", () => {
  const g = game();
  g.player.x = 560;
  g.step(dt, {});
  steps(g, 15, {});
  const vy = g.player.vy;
  g.step(dt, { jumpPressed: true, jumpHeld: true });
  assert.ok(g.player.vy > vy);
  assert.equal(g.drainEvents().filter((e) => e.type === "jump").length, 0);
});
test("releasing manual jump reduces apex, holding produces the full jump", () => {
  const heights = [];
  for (const held of [false, true]) {
    const g = game();
    g.step(dt, { jumpPressed: true, jumpHeld: true });
    steps(g, 50, { jumpHeld: held });
    heights.push(g.height);
  }
  assert.ok(heights[1] > heights[0] + 20);
});
test("one-way platforms allow upward passage and catch descending crossed feet", () => {
  const g = game();
  g.platforms = [{ id: 0, x: 420, y: 550, w: 160, baseX: 420, moving: false }];
  airborne(g, 420, 560, -400);
  g.step(1 / 30, { jumpHeld: true });
  assert.ok(g.player.y < 550);
  assert.equal(g.player.grounded, false);
  airborne(g, 420, 540, 800);
  g.step(1 / 30, {});
  assert.equal(g.player.y, 550);
  assert.equal(g.player.grounded, true);
});
test("platform edge uses the crossing-time X, avoiding fast diagonal phantom landings", () => {
  const g = game();
  g.platforms = [{ id: 0, x: 420, y: 550, w: 80, baseX: 420, moving: false }];
  airborne(g, 490, 549, 800);
  g.player.vx = -340;
  g.step(1 / 30, { left: true });
  assert.equal(g.player.grounded, false);
});
test("fast rock sweep hits head even when both endpoints miss", () => {
  const p = { x: 400, y: 600, prevX: 400, prevY: 600 };
  assert.equal(
    hazardHitsPlayer({ x: 417, y: 550, prevX: 417, prevY: 400, r: 15 }, p),
    true,
  );
});
test("relative-motion sweep detects the player crossing a stationary rock", () => {
  assert.equal(
    hazardHitsPlayer(
      { x: 400, y: 530, prevX: 400, prevY: 530, r: 12 },
      { x: 450, y: 600, prevX: 350, prevY: 600 },
    ),
    true,
  );
});
test("air beside the long hair is safe; rounded corners do not create square phantom hits", () => {
  const p = { x: 400, y: 600, prevX: 400, prevY: 600 };
  assert.equal(
    hazardHitsPlayer({ x: 368, y: 500, prevX: 368, prevY: 500, r: 8 }, p),
    false,
  );
  assert.equal(
    sweepRoundedRect(-14, -14, -14, -14, 5, { x: 0, y: 0, w: 20, h: 20 }),
    false,
  );
  assert.equal(
    sweepRoundedRect(-13, -13, -13, -13, 5, { x: 0, y: 0, w: 20, h: 20 }),
    true,
  );
});
test("boots remain vulnerable but the gap between them is safe", () => {
  const p = { x: 400, y: 600, prevX: 400, prevY: 600 };
  assert.equal(hazardHitsPlayer({ x: 383, y: 575, r: 5 }, p), true);
  assert.equal(hazardHitsPlayer({ x: 400, y: 590, r: 3 }, p), false);
});
test("one hit removes one heart and simultaneous hazards respect the invulnerability window", () => {
  const g = game();
  const r = {
    x: 437,
    y: 560,
    prevX: 437,
    prevY: 560,
    vy: 0,
    r: 18,
    rotation: 0,
    spin: 0,
  };
  g.hazards = [{ ...r }, { ...r }];
  g.step(dt, {});
  assert.equal(g.lives, C.MAX_LIVES - 1);
  assert.ok(g.invulnerable > 1.4);
  g.hazards = [{ ...r }];
  g.step(dt, {});
  assert.equal(g.lives, C.MAX_LIVES - 1);
});
test("five separated rock hits end the run; falling is independently fatal", () => {
  const g = game();
  for (let i = 0; i < C.MAX_LIVES; i++) {
    g.invulnerable = 0;
    g.player.grounded = true;
    g.player.y = 650;
    g.player.vx = 0;
    g.player.facing = 1;
    g.hazards = [
      { x: g.player.x + 17, y: 560, vy: 0, r: 18, rotation: 0, spin: 0 },
    ];
    g.step(dt, {});
  }
  assert.equal(g.status, "over");
  assert.equal(g.reason, "hazards");
  const f = game();
  airborne(f, 20, 900, 200);
  f.step(dt, {});
  assert.equal(f.status, "over");
  assert.equal(f.reason, "fall");
});
test("pause freezes time, clears buffered input, and reset clears every run statistic", () => {
  const g = game(true),
    r = new FrameRunner(g);
  r.advance(0.1, {});
  g.pause();
  const p = { ...g.player },
    time = g.time;
  r.advance(1, { jumpPressed: true });
  assert.deepEqual(g.player, p);
  assert.equal(g.time, time);
  assert.equal(r.pendingJump, false);
  g.pause();
  g.start();
  assert.equal(g.height, 0);
  assert.equal(g.lives, C.MAX_LIVES);
  assert.equal(g.hazards.length, 0);
  assert.equal(g.status, "playing");
});
test("warnings give a full second of notice before spawning real damaging hazards", () => {
  const g = game();
  g.hazardTimer = 0.001;
  g.step(dt, {});
  assert.equal(g.warnings.length, 1);
  assert.equal(g.hazards.length, 0);
  steps(g, 110);
  assert.equal(g.hazards.length, 0);
  steps(g, 18);
  assert.equal(g.warnings.length, 0);
  assert.equal(g.hazards.length, 1);
});
test("a long frame is capped at 100 ms, preventing a tab-return death spiral", () => {
  const g = game(),
    r = new FrameRunner(g);
  assert.equal(r.advance(5, {}), 12);
  assert.ok(g.time < 0.101);
});

test("facing left mirrors the small face offset without widening the hair silhouette", () => {
  const player = { x: 400, y: 600, facing: -1 as const };
  assert.equal(hazardHitsPlayer({ x: 420, y: 528, r: 4 }, player), true);
  assert.equal(hazardHitsPlayer({ x: 370, y: 500, r: 4 }, player), false);
});

test("holding jump without a new press edge never creates an automatic second manual jump", () => {
  const g = game();
  g.step(dt, { jumpPressed: true, jumpHeld: true });
  steps(g, 220, { jumpHeld: true });
  assert.equal(
    g.drainEvents().filter((event) => event.type === "jump").length,
    1,
  );
  assert.equal(g.player.grounded, true);
});

test("freshly paused and resumed simulations cannot retain an old jump press", () => {
  const g = game();
  g.jumpBuffer = C.BUFFER;
  g.pause();
  g.pause();
  g.step(dt, { jumpHeld: true });
  assert.equal(g.player.grounded, true);
});

test("notes are awarded once and removed, including across multiple fixed substeps", () => {
  const g = game();
  g.pickups = [
    { id: 900, x: g.player.x, y: g.player.y - 75, collected: false },
  ];
  steps(g, 12);
  assert.equal(g.notes, 1);
  assert.equal(g.pickups.length, 0);
  assert.equal(
    g.drainEvents().filter((event) => event.type === "note").length,
    1,
  );
});

test("mobile-height worlds preserve initial footing and can still scroll upward", () => {
  const g = new Game({ random: seeded(13), viewHeight: 1050 });
  g.start();
  assert.equal(g.player.y - g.cameraY, 960);
  g.hazardTimer = 999;
  let targetId = 1;
  for (let i = 0; i < 120 * 12 && g.status === "playing"; i++) {
    if (
      g.player.grounded &&
      g.player.groundId !== null &&
      g.player.groundId >= targetId
    )
      targetId++;
    const next = g.platforms.find((platform) => platform.id === targetId);
    const distance = (next?.x ?? g.player.x) - g.player.x;
    g.step(dt, { left: distance < -11, right: distance > 11 });
  }
  assert.ok(g.height > 200);
  assert.ok(g.cameraY < -600);
  assert.equal(g.status, "playing");
});

test("short desktop canvases keep the starting floor and character visible before jumping", () => {
  const g = new Game({ viewHeight: 550 });
  assert.equal(g.player.y - g.cameraY, 460);
  assert.ok(g.player.y - g.cameraY - 150 > 0);
  g.start();
  g.step(dt, {});
  assert.equal(g.status, "playing");
});
test("a seeded pilot can climb at least 30 platforms across several generated routes", () => {
  for (const seed of [1, 7, 23, 92]) {
    const g = new Game({ random: seeded(seed), autoJump: true });
    g.start();
    g.hazardTimer = 9999;
    let targetId = 1;
    for (let tick = 0; tick < 120 * 45 && g.status === "playing"; tick++) {
      // This pilot verifies platform reachability, independently of enemies/powerups.
      g.penguins = [];
      g.pickups = g.pickups.filter((p) => p.kind !== "rocket");
      const p = g.player;
      if (p.grounded && p.groundId !== null && p.groundId >= targetId)
        targetId = p.groundId + 1;
      const next = g.platforms.find((s) => s.id === targetId);
      const target = next?.x ?? p.x;
      const dx = target - p.x;
      g.penguins = [];
      g.pickups = g.pickups.filter((p) => p.kind !== "rocket");
      g.step(dt, { left: dx < -11, right: dx > 11 });
    }
    assert.ok(
      g.height > 650,
      `seed ${seed} reached only ${g.height} m (${g.reason})`,
    );
    assert.equal(g.status, "playing");
  }
});

test("music unlocks only on new ten-floor thresholds, never repeated landings", () => {
  const g = game();
  const land = (id: number) => {
    g.platforms = [{ id, x: 420, y: 550, w: 160, baseX: 420, moving: false }];
    airborne(g, 420, 549, 400);
    g.step(dt, {});
    return g.drainEvents().filter((e) => e.type === "music");
  };
  assert.equal(land(9).length, 0);
  assert.deepEqual(land(10), [{ type: "music", tier: 1, floor: 10 }]);
  assert.equal(land(10).length, 0);
  assert.equal(land(8).length, 0);
  assert.deepEqual(land(20), [{ type: "music", tier: 2, floor: 20 }]);
  g.start();
  assert.equal(g.floor, 0);
  assert.equal(g.musicTier, 0);
});

test("all hazard silhouettes sweep continuously while nearby empty space stays safe", () => {
  const p = { x: 400, y: 600 };
  for (const kind of ["rock", "statue", "cross"] as const) {
    assert.equal(
      hazardHitsPlayer(
        {
          kind,
          x: 400,
          y: 560,
          prevX: 400,
          prevY: 350,
          r: 20,
          rotation: 0,
          prevRotation: 0,
        },
        p,
      ),
      true,
      kind,
    );
    assert.equal(
      hazardHitsPlayer({ kind, x: 460, y: 500, r: 20, rotation: 0 }, p),
      false,
      kind,
    );
  }
  // A cross has empty corners; its enclosing box must not count as solid stone.
  assert.equal(
    hazardHitsPlayer({ kind: "cross", x: 434, y: 550, r: 24, rotation: 0 }, p),
    false,
  );
});

test("warning generation includes rocks, statues and crosses and preserves their kinds on spawn", () => {
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 18; seed++) {
    const g = new Game({ random: seeded(seed) });
    g.start();
    g.hazardTimer = 0;
    g.step(dt, {});
    const warning = g.warnings[0];
    kinds.add(warning.kind!);
    warning.remaining = 0.001;
    g.hazardTimer = 999;
    g.step(dt, {});
    assert.equal(g.hazards[0].kind, warning.kind);
  }
  assert.deepEqual([...kinds].sort(), ["cross", "rock", "statue"]);
});

test("portrait 3:4, 9:16 and 9:20 keep feet visible and automatic climbing playable", () => {
  for (const ratio of [3 / 4, 9 / 16, 9 / 20]) {
    const h = Math.round(C.WIDTH / ratio),
      g = new Game({ random: seeded(7), viewHeight: h });
    g.start();
    g.hazardTimer = 9999;
    assert.equal(g.player.y - g.cameraY, h - 90);
    let target = 1;
    for (let i = 0; i < 120 * 14; i++) {
      if (
        g.player.grounded &&
        g.player.groundId !== null &&
        g.player.groundId >= target
      )
        target = g.player.groundId + 1;
      const dx =
        (g.platforms.find((p) => p.id === target)?.x ?? g.player.x) -
        g.player.x;
      g.penguins = [];
      g.pickups = g.pickups.filter((p) => p.kind !== "rocket");
      g.step(dt, { left: dx < -11, right: dx > 11 });
    }
    assert.equal(g.status, "playing");
    assert.ok(g.floor >= 10, `${ratio}: ${g.floor}`);
    assert.ok(g.musicTier >= 1);
  }
});

test("a cucumber restores exactly one of five hearts and is consumed once", () => {
  const g = game();
  g.lives = 3;
  g.pickups = [
    {
      kind: "cucumber",
      id: -4,
      x: g.player.x,
      y: g.player.y - 75,
      collected: false,
    },
  ];
  steps(g, 3);
  assert.equal(g.lives, 4);
  assert.equal(g.pickups.length, 0);
  assert.equal(g.notes, 0);
  const heal = g.drainEvents().filter((e) => e.type === "heal");
  assert.equal(heal.length, 1);
  assert.equal(heal[0].restored, 1);
  steps(g, 3);
  assert.equal(g.lives, 4);
});

test("full-health cucumbers are still eaten without exceeding the five-heart limit", () => {
  const g = game();
  assert.equal(g.lives, 5);
  g.pickups = [
    {
      kind: "cucumber",
      id: -4,
      x: g.player.x,
      y: g.player.y - 75,
      collected: false,
    },
  ];
  g.step(dt, {});
  assert.equal(g.lives, 5);
  assert.equal(g.pickups.length, 0);
  const event = g.drainEvents().find((e) => e.type === "heal");
  assert.equal(event?.restored, 0);
});

test("cucumbers spawn on selected platforms and do not change damage protection duration", () => {
  const g = game();
  assert.ok(g.pickups.some((p) => p.kind === "cucumber"));
  const cucumber = g.pickups.find((p) => p.kind === "cucumber")!;
  const platform = g.platforms.find((p) => p.id === -cucumber.id)!;
  assert.ok(Math.abs(cucumber.x - platform.x) < platform.w / 2);
  assert.ok(cucumber.y < platform.y);
  g.lives = 4;
  g.invulnerable = 1;
  g.pickups = [
    {
      kind: "cucumber",
      id: -4,
      x: g.player.x,
      y: g.player.y - 75,
      collected: false,
    },
  ];
  g.step(dt, {});
  assert.equal(g.lives, 5);
  assert.ok(Math.abs(g.invulnerable - (1 - dt)) < 1e-8);
});

function eatRocket(g: Game): void {
  g.pickups = [
    {
      kind: "rocket",
      id: 900001,
      x: g.player.x,
      y: g.player.y - 60,
      collected: false,
    },
  ];
  g.step(dt, {});
}
function penguinFixture() {
  const g = game();
  g.platforms = [{ id: 0, x: 420, baseX: 420, y: 550, w: 166, moving: false }];
  g.platforms.push({
    id: 999,
    x: 420,
    baseX: 420,
    y: -1000,
    w: 166,
    moving: false,
  });
  g.pickups = [];
  g.penguins = [
    {
      id: 1,
      platformId: 0,
      x: 420,
      y: 550,
      alive: true,
      facing: 1,
      throwTimer: 999,
    },
  ];
  return g;
}

test("rocket pickup is consumed once, accelerates upward for three seconds and restores normal gravity", () => {
  const g = game();
  eatRocket(g);
  assert.equal(g.rocketTime, 3);
  assert.equal(
    g.pickups.some((p) => p.id === 900001),
    false,
  );
  assert.equal(g.notes, 0);
  const firstSpeed = g.player.vy;
  for (let i = 0; i < 120; i++) {
    g.pickups = [];
    g.penguins = [];
    g.step(dt, { jumpPressed: true, jumpHeld: false });
  }
  assert.ok(g.player.vy < firstSpeed);
  assert.ok(g.player.vy >= -C.ROCKET_MAX_SPEED);
  assert.ok(Math.abs(g.rocketTime - 2) < 1e-8);
  for (let i = 0; i < 240; i++) {
    g.pickups = [];
    g.penguins = [];
    g.step(dt, {});
  }
  assert.equal(g.rocketTime, 0);
  assert.ok(g.player.vy > -C.JUMP_SPEED);
  const speed = g.player.vy;
  g.step(dt, {});
  assert.ok(g.player.vy > speed);
});

test("rocket protects against sky and penguin rocks, expiry restores damage immediately", () => {
  const g = game();
  eatRocket(g);
  for (const source of ["sky", "penguin"] as const) {
    g.hazards = [
      {
        kind: "rock",
        source,
        x: g.player.x,
        y: g.player.y - 71,
        vy: 0,
        r: 18,
        rotation: 0,
        spin: 0,
      },
    ];
    g.step(dt, {});
    assert.equal(g.lives, 5);
    assert.equal(
      g.drainEvents().some((e) => e.type === "hit"),
      false,
    );
  }
  g.rocketTime = dt;
  g.step(dt, {});
  assert.equal(g.rocketTime, 0);
  g.player.grounded = true;
  g.player.groundId = 0;
  g.player.y = 650;
  g.hazards = [
    {
      kind: "rock",
      source: "penguin",
      x: g.player.x,
      y: 579,
      vy: 0,
      r: 18,
      rotation: 0,
      spin: 0,
    },
  ];
  g.step(dt, {});
  assert.equal(g.lives, 4);
});

test("rocket permits steering, refreshes to three seconds and freezes while paused", () => {
  const g = game();
  eatRocket(g);
  const x = g.player.x;
  steps(g, 24, { right: true });
  assert.ok(g.player.x > x);
  eatRocket(g);
  assert.equal(g.rocketTime, 3);
  g.pause();
  const p = { ...g.player };
  steps(g, 120, { left: true });
  assert.equal(g.rocketTime, 3);
  assert.deepEqual(g.player, p);
  g.start();
  assert.equal(g.rocketTime, 0);
});

test("rocket crossings advance floor/music progress without counting repeated floors", () => {
  const g = game();
  g.platforms = [{ id: 10, x: 420, baseX: 420, y: 500, w: 166, moving: false }];
  airborne(g, 420, 501, -480);
  g.rocketTime = 3;
  g.step(dt, {});
  assert.equal(g.floor, 10);
  assert.equal(g.musicTier, 1);
  assert.equal(g.drainEvents().filter((e) => e.type === "music").length, 1);
  g.step(dt, {});
  assert.equal(g.drainEvents().filter((e) => e.type === "music").length, 0);
});

test("descending onto a penguin defeats it once and bounces from its head", () => {
  const g = penguinFixture();
  airborne(g, 420, 500, 800);
  g.step(1 / 30, {});
  assert.equal(g.penguins.length, 0);
  assert.equal(g.player.y, 550 - C.PENGUIN_HEIGHT);
  assert.ok(g.player.vy < 0);
  assert.equal(g.lives, 5);
  assert.equal(g.drainEvents().filter((e) => e.type === "stomp").length, 1);
  steps(g, 5);
  assert.equal(g.drainEvents().filter((e) => e.type === "stomp").length, 0);
});

test("upward passage and a late diagonal crossing do not stomp a penguin", () => {
  const up = penguinFixture();
  airborne(up, 420, 516, -400);
  up.step(1 / 30, {});
  assert.equal(up.penguins.length, 1);
  assert.ok(up.player.vy < 0);
  const side = penguinFixture();
  airborne(side, 453, 507, 800);
  side.player.vx = -340;
  side.step(1 / 30, { left: true });
  assert.equal(side.penguins.length, 1);
});

test("penguin body contact from below or either side cannot cause launch-frame damage", () => {
  for (const [x, y, vy] of [
    [420, 600, -400],
    [392, 550, 0],
    [448, 550, 0],
  ]) {
    const g = penguinFixture();
    g.penguins[0].throwTimer = 0;
    airborne(g, x, y, vy);
    g.step(dt);
    assert.equal(g.lives, 5, `body contact at ${x},${y}`);
    assert.equal(g.invulnerable, 0);
    assert.equal(g.penguins.length, 1);
    assert.ok(
      !g.drainEvents().some((e) => e.type === "hit" || e.type === "stomp"),
    );
  }
});

test("released penguin stones remain harmful even when returning next to the thrower", () => {
  const g = penguinFixture();
  airborne(g, 510, 550, 0);
  g.penguins[0].throwTimer = 0;
  g.step(dt);
  const stone = g.hazards.find((h) => h.ownerId === 1)!;
  assert.equal(stone.clearedThrower, false);
  stone.x = 600;
  stone.y = 520;
  stone.vx = stone.vy = 0;
  g.step(dt);
  assert.equal(stone.clearedThrower, true);
  g.player.x = 420;
  stone.x = 420;
  stone.y = 520;
  stone.vx = stone.vy = 0;
  g.step(dt);
  assert.equal(g.lives, 4);
  assert.ok(g.drainEvents().some((e) => e.type === "hit"));
});

test("penguin launch speed ignores the player's position, including later throws", () => {
  for (const facing of [-1, 1] as const) {
    const launches = [];
    for (const [x, y] of [
      [100, 650],
      [740, 400],
    ]) {
      const g = penguinFixture();
      g.invulnerable = 999;
      g.penguins[0].facing = facing;
      airborne(g, x, y, 0);
      g.penguins[0].throwTimer = 0;
      g.step(dt);
      const first = g.hazards.find((h) => h.ownerId === 1)!;
      launches.push([first.vx, first.vy]);
      g.hazards = [];
      g.player.x = C.WIDTH - x;
      g.penguins[0].throwTimer = 0;
      g.step(dt);
      const second = g.hazards.find((h) => h.ownerId === 1)!;
      assert.deepEqual([second.vx, second.vy], [first.vx, first.vy]);
    }
    assert.deepEqual(launches[0], launches[1]);
    assert.equal(launches[0][0], facing * C.PENGUIN_STONE_SPEED_X);
    assert.ok(launches[0][1]! < 0);
  }
});

test("penguin stones follow a gravity arc without steering as the player crosses sides", () => {
  for (const facing of [-1, 1] as const) {
    const g = penguinFixture();
    g.platforms[0].w = C.WIDTH;
    g.player.y = 550;
    g.invulnerable = 999;
    g.penguins[0].facing = facing;
    g.penguins[0].throwTimer = 0;
    const launchX = 420 + facing * 16,
      launchY = 550 - 34;
    let minimumY = launchY;
    for (let n = 1; n <= 144; n++) {
      g.player.x = n % 40 < 20 ? 100 : 740;
      g.step(dt);
      const stone = g.hazards.find((h) => h.ownerId === 1)!;
      assert.ok(stone);
      const expectedX = launchX + facing * C.PENGUIN_STONE_SPEED_X * n * dt;
      const expectedY =
        launchY -
        C.PENGUIN_STONE_SPEED_Y * n * dt +
        (C.PENGUIN_STONE_GRAVITY * dt * dt * n * (n + 1)) / 2;
      assert.ok(Math.abs(stone.x - expectedX) < 1e-7);
      assert.ok(Math.abs(stone.y - expectedY) < 1e-7);
      assert.equal(stone.vx, facing * C.PENGUIN_STONE_SPEED_X);
      minimumY = Math.min(minimumY, stone.y);
      if (n === 144) {
        assert.ok(stone.vy > 0);
        assert.ok(stone.y > launchY);
      }
    }
    assert.ok(minimumY < launchY - 80);
  }
});

test("penguins throw upward along their facing direction, and a hit removes exactly one heart", () => {
  const g = game();
  g.pickups = [];
  g.player.x = 510;
  g.penguins = [
    {
      id: 1,
      platformId: 0,
      x: 420,
      y: 650,
      alive: true,
      facing: 1,
      throwTimer: 0,
    },
  ];
  g.step(dt, {});
  const stone = g.hazards.find((h) => h.source === "penguin")!;
  assert.ok(stone);
  assert.ok(stone.vx! > 0);
  assert.ok(stone.x > 420);
  assert.equal(g.drainEvents().filter((e) => e.type === "throw").length, 1);
  g.penguins = [];
  stone.x = g.player.x;
  stone.y = g.player.y - 71;
  stone.vx = 0;
  stone.vy = 0;
  g.step(dt, {});
  assert.equal(g.lives, 4);
  assert.ok(g.invulnerable > 0);
});

test("stomp wins over a stone released from the same penguin on that physics step", () => {
  const g = penguinFixture();
  g.penguins[0].throwTimer = 0;
  airborne(g, 420, 500, 800);
  g.step(1 / 30, {});
  assert.equal(g.penguins.length, 0);
  assert.equal(g.lives, 5);
  assert.equal(g.hazards.filter((h) => h.ownerId === 1).length, 0);
});

test("rocket and penguin spawns sit on selected platforms and reset with the run", () => {
  const g = game();
  const rocket = g.pickups.find((p) => p.kind === "rocket")!,
    enemy = g.penguins[0];
  assert.ok(rocket);
  assert.ok(enemy);
  const platform = g.platforms.find((p) => p.id === enemy.platformId)!;
  assert.equal(enemy.x, platform.x);
  assert.equal(enemy.y, platform.y);
  g.penguins[0].alive = false;
  g.start();
  assert.ok(g.penguins.every((e) => e.alive));
  assert.equal(g.rocketTime, 0);
});

test("boost physics remain identical at 30, 60, 120 and 144 render frames per second", () => {
  const snapshots = [];
  for (const fps of [30, 60, 120, 144]) {
    const g = game();
    eatRocket(g);
    const runner = new FrameRunner(g);
    for (let i = 0; i < fps * 2; i++) {
      g.pickups = [];
      g.penguins = [];
      runner.advance(1 / fps, { right: i < fps / 2 });
    }
    snapshots.push([
      g.player.x,
      g.player.y,
      g.player.vy,
      g.rocketTime,
      g.height,
    ]);
  }
  for (const state of snapshots.slice(1))
    for (let i = 0; i < state.length; i++)
      assert.ok(Math.abs(state[i] - snapshots[0][i]) < 1e-6);
});
