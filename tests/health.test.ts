import test from "node:test";
import assert from "node:assert/strict";
import { HealthDisplay, describeHealth } from "../src/ui/HealthDisplay.ts";

class FakeElement {
  textContent = "";
  innerHTML = "";
  offsetWidth = 300;
  readonly classes = new Set<string>();
  readonly attributes = new Map<string, string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, force: boolean) => {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function fixture(context: import("node:test").TestContext) {
  const elements = {
    panel: new FakeElement(),
    meter: new FakeElement(),
    hearts: Array.from({ length: 5 }, () => new FakeElement()),
    count: new FakeElement(),
    title: new FakeElement(),
    detail: new FakeElement(),
    icon: new FakeElement(),
    viewport: new FakeElement(),
    callout: new FakeElement(),
  };
  const display = new HealthDisplay(
    elements as unknown as ConstructorParameters<typeof HealthDisplay>[0],
  );
  context.after(() => display.reset());
  return { display, elements };
}

test("last heart remains critical while protection is active, and its warning returns after protection ends", () => {
  const protectedState = describeHealth(1, true, false);
  assert.equal(protectedState.critical, true);
  assert.equal(protectedState.protected, true);
  assert.match(protectedState.title, /保护/);
  assert.match(protectedState.detail, /最后一颗/);
  const vulnerableState = describeHealth(1, false, false);
  assert.equal(vulnerableState.protected, false);
  assert.match(vulnerableState.title, /只剩一颗心/);
});

test("game-over state never claims protection, and invalid health cannot produce extra hearts", () => {
  assert.equal(describeHealth(0, true, true).protected, false);
  assert.equal(describeHealth(0, true, true).critical, false);
  assert.equal(describeHealth(99, false, false).lives, 5);
  assert.equal(describeHealth(Number.NaN, false, false).lives, 0);
  assert.equal(describeHealth(-2, false, false).lives, 0);
});

test("taking damage animates exactly the lost heart and exposes visible damage and protection feedback", (context) => {
  const { display, elements: e } = fixture(context);
  display.update(3, false, false);
  display.update(2, true, false);
  assert.equal(e.hearts[2].classes.has("is-empty"), true);
  assert.equal(e.hearts[2].classes.has("lost-now"), true);
  assert.equal(e.hearts[1].classes.has("lost-now"), false);
  assert.equal(e.panel.classes.has("taking-damage"), true);
  assert.equal(e.viewport.classes.has("damage-active"), true);
  assert.equal(e.callout.classes.has("visible"), true);
  assert.equal(e.count.textContent, "2");
  assert.match(e.meter.attributes.get("aria-label") ?? "", /剩余生命 2/);
});

test("score-only refreshes cannot retrigger damage, and protection expiry clears its badge", (context) => {
  const { display, elements: e } = fixture(context);
  display.update(3, false, false);
  display.update(2, true, false);
  e.callout.classes.delete("visible");
  display.update(2, true, false);
  assert.equal(e.callout.classes.has("visible"), false);
  display.update(2, false, false);
  assert.equal(e.panel.classes.has("is-protected"), false);
  assert.match(e.title.textContent, /继续向上/);
});

test("restart clears the old loss animation, damage veil, danger state and protection state", (context) => {
  const { display, elements: e } = fixture(context);
  display.update(3, false, false);
  display.update(1, true, false);
  display.reset();
  display.update(5, false, false);
  assert.equal(
    e.hearts.every((heart) => heart.classes.has("is-full")),
    true,
  );
  assert.equal(
    e.hearts.some((heart) => heart.classes.has("lost-now")),
    false,
  );
  assert.equal(e.viewport.classes.has("damage-active"), false);
  assert.equal(e.callout.classes.has("visible"), false);
  assert.equal(e.panel.classes.has("is-critical"), false);
  assert.equal(e.panel.classes.has("is-protected"), false);
});

import { DamagePulse, GLITCH_DURATION } from "../src/render/DamagePulse.ts";
test("damage glitch decays to zero, cannot accumulate and clears immediately on restart", () => {
  const pulse = new DamagePulse();
  assert.equal(pulse.advance(0, false), 0);
  pulse.trigger();
  const initial = pulse.advance(0, false);
  assert.equal(initial, 1);
  const middle = pulse.advance(GLITCH_DURATION / 2, false);
  assert.ok(middle > 0 && middle < initial);
  pulse.trigger();
  assert.equal(pulse.advance(0, false), 1);
  assert.equal(pulse.advance(GLITCH_DURATION + 1, false), 0);
  pulse.trigger();
  pulse.clear();
  assert.equal(pulse.advance(0, false), 0);
});
test("reduced-motion glitch is low intensity and does not alter its duration", () => {
  const pulse = new DamagePulse();
  pulse.trigger();
  assert.equal(pulse.advance(0, true), 0.12);
  assert.equal(pulse.advance(GLITCH_DURATION, true), 0);
});

test("healing restores the correct empty heart without triggering damage or exceeding five slots", (context) => {
  const { display, elements: e } = fixture(context);
  display.update(4, false, false);
  display.update(5, false, false);
  assert.equal(e.hearts[4].classes.has("restored-now"), true);
  assert.equal(e.hearts[4].classes.has("is-full"), true);
  assert.equal(e.viewport.classes.has("damage-active"), false);
  assert.match(e.meter.attributes.get("aria-label") ?? "", /最多 5/);
  display.reset();
  assert.equal(e.hearts[4].classes.has("restored-now"), false);
});
