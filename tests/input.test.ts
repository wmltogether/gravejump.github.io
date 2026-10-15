import test from "node:test";
import assert from "node:assert/strict";
import { InputController } from "../src/input/InputController.ts";

/** Minimal event targets exercise our input adapter without a browser or network. */
class Control extends EventTarget {
  tagName = "BUTTON";
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  setPointerCapture(_id: number): void {}
  getBoundingClientRect() {
    return { left: 100, width: 400 };
  }
  closest(_selector: string): null {
    return null;
  }
}
class TestDocument extends EventTarget {
  hidden = false;
}

function event(type: string, properties: Record<string, unknown>): Event {
  return Object.assign(new Event(type, { cancelable: true }), properties);
}

function fixture(
  context: import("node:test").TestContext,
  pointerEvents = true,
) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const windowTarget = new EventTarget();
  if (pointerEvents)
    Object.defineProperty(windowTarget, "PointerEvent", { value: Event });
  const documentTarget = new TestDocument();
  Object.defineProperty(globalThis, "window", {
    value: windowTarget,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: documentTarget,
    configurable: true,
  });
  context.after(() => {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const left = new Control(),
    right = new Control(),
    jump = new Control(),
    viewport = new Control();
  viewport.tagName = "DIV";
  let paused = 0;
  let playing = true;
  const controller = new InputController({
    viewport: viewport as unknown as HTMLElement,
    buttons: {
      left: left as unknown as HTMLButtonElement,
      right: right as unknown as HTMLButtonElement,
      jump: jump as unknown as HTMLButtonElement,
    },
    isPlaying: () => playing,
    onPause: () => {
      paused++;
      playing = false;
    },
    onStart: () => {
      playing = true;
    },
  });
  return {
    controller,
    left,
    right,
    jump,
    viewport,
    windowTarget,
    documentTarget,
    paused: () => paused,
  };
}

test("keyboard repeat cannot create new jump edges; release and repress can", (context) => {
  const f = fixture(context);
  f.windowTarget.dispatchEvent(
    event("keydown", { code: "Space", repeat: false }),
  );
  assert.equal(f.controller.readFrame().jumpPressed, true);
  f.windowTarget.dispatchEvent(
    event("keydown", { code: "Space", repeat: true }),
  );
  assert.equal(f.controller.readFrame().jumpPressed, false);
  assert.equal(f.controller.readFrame().jumpHeld, true);
  f.windowTarget.dispatchEvent(event("keyup", { code: "Space" }));
  assert.equal(f.controller.readFrame().jumpHeld, false);
  f.windowTarget.dispatchEvent(
    event("keydown", { code: "Space", repeat: false }),
  );
  assert.equal(f.controller.readFrame().jumpPressed, true);
});

test("a quick press and release between frames preserves its edge but not held state", (context) => {
  const f = fixture(context);
  f.windowTarget.dispatchEvent(
    event("keydown", { code: "Space", repeat: false }),
  );
  f.windowTarget.dispatchEvent(event("keyup", { code: "Space" }));
  const frame = f.controller.readFrame();
  assert.equal(frame.jumpPressed, true);
  assert.equal(frame.jumpHeld, false);
  assert.equal(f.controller.readFrame().jumpPressed, false);
});

test("touch direction stays held until every captured pointer has released", (context) => {
  const f = fixture(context);
  f.left.dispatchEvent(event("pointerdown", { pointerId: 1 }));
  f.left.dispatchEvent(event("pointerdown", { pointerId: 2 }));
  f.left.dispatchEvent(event("pointerup", { pointerId: 1 }));
  assert.equal(f.controller.readFrame().left, true);
  f.left.dispatchEvent(event("pointercancel", { pointerId: 2 }));
  assert.equal(f.controller.readFrame().left, false);
  assert.equal(f.left.classes.has("pressed"), false);
});

test("simultaneous touch direction and jump do not overwrite each other", (context) => {
  const f = fixture(context);
  f.right.dispatchEvent(event("pointerdown", { pointerId: 1 }));
  f.jump.dispatchEvent(event("pointerdown", { pointerId: 2 }));
  const frame = f.controller.readFrame();
  assert.equal(frame.right, true);
  assert.equal(frame.jumpPressed, true);
  assert.equal(frame.jumpHeld, true);
  f.jump.dispatchEvent(event("lostpointercapture", { pointerId: 2 }));
  assert.equal(f.controller.readFrame().right, true);
  assert.equal(f.controller.readFrame().jumpHeld, false);
});

test("losing window focus pauses and clears keys and touch input", (context) => {
  const f = fixture(context);
  f.windowTarget.dispatchEvent(
    event("keydown", { code: "ArrowLeft", repeat: false }),
  );
  f.jump.dispatchEvent(event("pointerdown", { pointerId: 2 }));
  f.windowTarget.dispatchEvent(new Event("blur"));
  assert.equal(f.paused(), 1);
  assert.deepEqual(f.controller.readFrame(), {
    left: false,
    right: false,
    jumpHeld: false,
    jumpPressed: false,
  });
});

test("background visibility also pauses, and reset prevents sticky directional state", (context) => {
  const f = fixture(context);
  f.windowTarget.dispatchEvent(
    event("keydown", { code: "KeyD", repeat: false }),
  );
  f.documentTarget.hidden = true;
  f.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.paused(), 1);
  assert.equal(f.controller.readFrame().right, false);
});

test("canvas halves respond immediately, cross the midpoint and release captured touches", (context) => {
  const f = fixture(context);
  f.viewport.dispatchEvent(
    event("pointerdown", { pointerId: 1, clientX: 150, pointerType: "touch" }),
  );
  assert.equal(f.controller.readFrame().left, true);
  f.viewport.dispatchEvent(
    event("pointermove", { pointerId: 1, clientX: 400 }),
  );
  assert.equal(f.controller.readFrame().left, false);
  assert.equal(f.controller.readFrame().right, true);
  f.viewport.dispatchEvent(event("pointercancel", { pointerId: 1 }));
  assert.equal(f.controller.readFrame().right, false);
});

test("canvas multitouch survives one finger release and resets on pause", (context) => {
  const f = fixture(context);
  f.viewport.dispatchEvent(
    event("pointerdown", { pointerId: 1, clientX: 140 }),
  );
  f.viewport.dispatchEvent(
    event("pointerdown", { pointerId: 2, clientX: 180 }),
  );
  f.viewport.dispatchEvent(event("pointerup", { pointerId: 1 }));
  assert.equal(f.controller.readFrame().left, true);
  f.windowTarget.dispatchEvent(new Event("blur"));
  assert.equal(f.controller.readFrame().left, false);
  f.viewport.dispatchEvent(
    event("pointerdown", { pointerId: 3, clientX: 180 }),
  );
  assert.equal(f.controller.readFrame().left, false);
});

test("context menu and active touch scrolling are canceled; right click never moves", (context) => {
  const f = fixture(context),
    menu = event("contextmenu", {}),
    scroll = event("touchmove", {});
  f.windowTarget.dispatchEvent(menu);
  f.viewport.dispatchEvent(scroll);
  assert.equal(menu.defaultPrevented, true);
  assert.equal(scroll.defaultPrevented, true);
  f.viewport.dispatchEvent(
    event("pointerdown", {
      pointerId: 4,
      clientX: 140,
      pointerType: "mouse",
      button: 2,
    }),
  );
  assert.equal(f.controller.readFrame().left, false);
});

test("a long viewport hold persists for 600 frames and releases outside the canvas", (context) => {
  const f = fixture(context);
  f.viewport.setPointerCapture = () => {
    throw new Error("capture unavailable");
  };
  f.viewport.dispatchEvent(
    event("pointerdown", { pointerId: 8, clientX: 140, pointerType: "touch" }),
  );
  for (let frame = 0; frame < 600; frame++) {
    assert.deepEqual(f.controller.readFrame(), {
      left: true,
      right: false,
      jumpHeld: false,
      jumpPressed: false,
    });
  }
  f.windowTarget.dispatchEvent(
    event("pointermove", { pointerId: 8, clientX: 420 }),
  );
  assert.equal(f.controller.readFrame().right, true);
  f.windowTarget.dispatchEvent(event("pointerup", { pointerId: 8 }));
  assert.equal(f.controller.readFrame().right, false);
});

test("native selection, callout gestures and dragging are blocked without breaking paused menu touches", (context) => {
  const f = fixture(context);
  for (const surface of [f.viewport, f.left, f.right, f.jump]) {
    for (const name of [
      "contextmenu",
      "selectstart",
      "dragstart",
      "touchstart",
      "touchmove",
      "touchend",
      "gesturestart",
      "gesturechange",
      "dblclick",
    ]) {
      const nativeEvent = event(name, {});
      surface.dispatchEvent(nativeEvent);
      assert.equal(nativeEvent.defaultPrevented, true, name);
    }
  }
  f.windowTarget.dispatchEvent(new Event("blur"));
  const menuTouch = event("touchstart", {});
  f.viewport.dispatchEvent(menuTouch);
  assert.equal(menuTouch.defaultPrevented, false);
});

test("global cancellation clears button holds and pagehide clears all input", (context) => {
  const f = fixture(context);
  f.left.dispatchEvent(event("pointerdown", { pointerId: 1 }));
  f.windowTarget.dispatchEvent(event("pointercancel", { pointerId: 1 }));
  assert.equal(f.controller.readFrame().left, false);
  assert.equal(f.left.classes.has("pressed"), false);
  f.right.dispatchEvent(event("pointerdown", { pointerId: 2 }));
  f.windowTarget.dispatchEvent(new Event("pagehide"));
  assert.equal(f.paused(), 1);
  assert.equal(f.controller.readFrame().right, false);
});

test("legacy touch holds support multiple fingers, crossing sides and canceling outside", (context) => {
  const f = fixture(context, false);
  f.viewport.dispatchEvent(
    event("touchstart", {
      changedTouches: [
        { identifier: 1, clientX: 140 },
        { identifier: 2, clientX: 420 },
      ],
    }),
  );
  for (let frame = 0; frame < 600; frame++) {
    const input = f.controller.readFrame();
    assert.equal(input.left, true);
    assert.equal(input.right, true);
  }
  f.windowTarget.dispatchEvent(
    event("touchend", { changedTouches: [{ identifier: 1 }] }),
  );
  assert.equal(f.controller.readFrame().left, false);
  assert.equal(f.controller.readFrame().right, true);
  f.windowTarget.dispatchEvent(
    event("touchmove", { changedTouches: [{ identifier: 2, clientX: 140 }] }),
  );
  assert.equal(f.controller.readFrame().left, true);
  assert.equal(f.controller.readFrame().right, false);
  f.windowTarget.dispatchEvent(
    event("touchcancel", { changedTouches: [{ identifier: 2 }] }),
  );
  assert.equal(f.controller.readFrame().left, false);
});

test("legacy buttons and viewport cooperate and jump creates one edge per hold", (context) => {
  const f = fixture(context, false);
  f.viewport.dispatchEvent(
    event("touchstart", { changedTouches: [{ identifier: 1, clientX: 140 }] }),
  );
  f.jump.dispatchEvent(
    event("touchstart", { changedTouches: [{ identifier: 2 }] }),
  );
  assert.deepEqual(f.controller.readFrame(), {
    left: true,
    right: false,
    jumpHeld: true,
    jumpPressed: true,
  });
  f.jump.dispatchEvent(
    event("touchstart", { changedTouches: [{ identifier: 3 }] }),
  );
  assert.equal(f.controller.readFrame().jumpPressed, false);
  f.windowTarget.dispatchEvent(
    event("touchend", { changedTouches: [{ identifier: 2 }] }),
  );
  assert.equal(f.controller.readFrame().jumpHeld, true);
  f.windowTarget.dispatchEvent(
    event("touchcancel", { changedTouches: [{ identifier: 3 }] }),
  );
  assert.equal(f.controller.readFrame().jumpHeld, false);
  assert.equal(f.jump.classes.has("pressed"), false);
  assert.equal(f.controller.readFrame().left, true);
});
