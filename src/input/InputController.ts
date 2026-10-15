import type { FrameInput } from "../engine/types.ts";
import { protectGameSurface } from "./protectGameSurface.ts";

type Direction = "left" | "right" | "jump";
interface InputOptions {
  viewport: HTMLElement;
  buttons: Record<Direction, HTMLButtonElement>;
  isPlaying: () => boolean;
  onPause: () => void;
  onStart: () => void;
}

const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "KeyA", "KeyD"]);
const JUMP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);

/** Converts browser events to held state plus a single jump edge per render frame. */
export class InputController {
  private readonly options: InputOptions;
  private readonly keys = new Set<string>();
  private readonly pointers: Record<Direction, Set<number>> = {
    left: new Set(),
    right: new Set(),
    jump: new Set(),
  };
  private pendingJump = false;
  private readonly canvasPointers = new Map<number, "left" | "right">();

  constructor(options: InputOptions) {
    this.options = options;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", this.onFocusLost);
    window.addEventListener("pagehide", this.onFocusLost);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.onFocusLost();
    });
    if ("PointerEvent" in window) {
      this.bindTouchButtons();
      this.bindCanvasHalves();
      window.addEventListener(
        "pointerup",
        (event) => this.releasePointer(event.pointerId),
        true,
      );
      window.addEventListener(
        "pointercancel",
        (event) => this.releasePointer(event.pointerId),
        true,
      );
    } else this.bindLegacyTouch();
    for (const surface of [options.viewport, ...Object.values(options.buttons)])
      protectGameSurface(surface, options.isPlaying);
    window.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  readFrame(): FrameInput {
    if (!this.options.isPlaying()) this.clear();
    const input: FrameInput = {
      left:
        this.keys.has("ArrowLeft") ||
        this.keys.has("KeyA") ||
        this.pointers.left.size > 0 ||
        Array.from(this.canvasPointers.values()).includes("left"),
      right:
        this.keys.has("ArrowRight") ||
        this.keys.has("KeyD") ||
        this.pointers.right.size > 0 ||
        Array.from(this.canvasPointers.values()).includes("right"),
      jumpHeld:
        this.keys.has("Space") ||
        this.keys.has("ArrowUp") ||
        this.keys.has("KeyW") ||
        this.pointers.jump.size > 0,
      jumpPressed: this.pendingJump,
    };
    this.pendingJump = false;
    return input;
  }

  clear(): void {
    this.keys.clear();
    this.pendingJump = false;
    this.canvasPointers.clear();
    for (const direction of ["left", "right", "jump"] as const) {
      this.pointers[direction].clear();
      this.options.buttons[direction].classList.remove("pressed");
    }
  }

  private onFocusLost = (): void => {
    if (this.options.isPlaying()) this.options.onPause();
    this.clear();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
    // Let Space activate focused interface buttons instead of stealing it as a jump.
    if (target?.tagName === "BUTTON" && event.code === "Space") return;
    if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) {
      this.options.onPause();
      event.preventDefault();
      return;
    }
    if (!MOVE_KEYS.has(event.code) && !JUMP_KEYS.has(event.code)) return;
    if (!this.options.isPlaying()) {
      if (
        JUMP_KEYS.has(event.code) &&
        !event.repeat &&
        target?.tagName !== "BUTTON"
      ) {
        event.preventDefault();
        this.options.onStart();
      }
      return;
    }
    event.preventDefault();
    if (
      JUMP_KEYS.has(event.code) &&
      !event.repeat &&
      !this.keys.has(event.code)
    )
      this.pendingJump = true;
    this.keys.add(event.code);
  };

  private bindTouchButtons(): void {
    for (const direction of ["left", "right", "jump"] as const) {
      const button = this.options.buttons[direction];
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!this.options.isPlaying()) return;
        this.capture(button, event.pointerId);
        const wasHeld = this.pointers[direction].size > 0;
        this.pointers[direction].add(event.pointerId);
        button.classList.add("pressed");
        if (direction === "jump" && !wasHeld) this.pendingJump = true;
      });
      const release = (event: PointerEvent): void => {
        this.pointers[direction].delete(event.pointerId);
        if (this.pointers[direction].size === 0)
          button.classList.remove("pressed");
      };
      for (const name of [
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ] as const)
        button.addEventListener(name, release);
    }
  }

  /** Hold either half of the actual canvas; no drag threshold or keyboard changes. */
  private bindCanvasHalves(): void {
    const viewport = this.options.viewport;
    viewport.addEventListener("pointerdown", (event) => {
      if (
        !this.options.isPlaying() ||
        (event.target as HTMLElement | null)?.closest?.("button")
      )
        return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      this.capture(viewport, event.pointerId);
      this.canvasPointers.set(event.pointerId, this.side(event.clientX));
    });
    const move = (event: PointerEvent): void => {
      if (this.canvasPointers.has(event.pointerId))
        this.canvasPointers.set(event.pointerId, this.side(event.clientX));
    };
    viewport.addEventListener("pointermove", move);
    window.addEventListener("pointermove", move, true);
    const release = (event: PointerEvent): void => {
      this.canvasPointers.delete(event.pointerId);
    };
    for (const name of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const)
      viewport.addEventListener(name, release);
  }

  private side(x: number): "left" | "right" {
    const bounds = this.options.viewport.getBoundingClientRect();
    return x < bounds.left + bounds.width / 2 ? "left" : "right";
  }

  private capture(surface: HTMLElement, id: number): void {
    // Global release handlers still work when a browser declines pointer capture.
    try {
      surface.setPointerCapture(id);
    } catch {}
  }

  private releasePointer(id: number): void {
    this.canvasPointers.delete(id);
    for (const direction of ["left", "right", "jump"] as const) {
      this.pointers[direction].delete(id);
      if (!this.pointers[direction].size)
        this.options.buttons[direction].classList.remove("pressed");
    }
  }

  /** Touch Events fallback for older iOS / embedded webviews without Pointer Events. */
  private bindLegacyTouch(): void {
    const viewport = this.options.viewport;
    viewport.addEventListener(
      "touchstart",
      (event) => {
        if (
          !this.options.isPlaying() ||
          (event.target as HTMLElement | null)?.closest?.("button")
        )
          return;
        event.preventDefault();
        for (const touch of Array.from(event.changedTouches))
          this.canvasPointers.set(touch.identifier, this.side(touch.clientX));
      },
      { passive: false },
    );
    for (const direction of ["left", "right", "jump"] as const) {
      this.options.buttons[direction].addEventListener(
        "touchstart",
        (event) => {
          if (!this.options.isPlaying()) return;
          event.preventDefault();
          const wasHeld = this.pointers[direction].size > 0;
          for (const touch of Array.from(event.changedTouches))
            this.pointers[direction].add(touch.identifier);
          this.options.buttons[direction].classList.add("pressed");
          if (direction === "jump" && !wasHeld) this.pendingJump = true;
        },
        { passive: false },
      );
    }
    const move = (event: TouchEvent): void => {
      for (const touch of Array.from(event.changedTouches)) {
        if (!this.canvasPointers.has(touch.identifier)) continue;
        if (event.cancelable) event.preventDefault();
        this.canvasPointers.set(touch.identifier, this.side(touch.clientX));
      }
    };
    const release = (event: TouchEvent): void => {
      for (const touch of Array.from(event.changedTouches))
        this.releasePointer(touch.identifier);
    };
    viewport.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchmove", move, {
      passive: false,
      capture: true,
    });
    for (const surface of [
      window,
      viewport,
      ...Object.values(this.options.buttons),
    ]) {
      surface.addEventListener("touchend", release as EventListener, {
        capture: true,
      });
      surface.addEventListener("touchcancel", release as EventListener, {
        capture: true,
      });
    }
  }
}
