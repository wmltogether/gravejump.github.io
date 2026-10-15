import type { FrameInput } from "../engine/types.ts";

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
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.onFocusLost();
    });
    this.bindTouchButtons();
    this.bindCanvasHalves();
    window.addEventListener("contextmenu", (event) => event.preventDefault());
    options.viewport.addEventListener("selectstart", (event) =>
      event.preventDefault(),
    );
    options.viewport.addEventListener("dragstart", (event) =>
      event.preventDefault(),
    );
    options.viewport.addEventListener(
      "touchmove",
      (event) => {
        if (options.isPlaying()) event.preventDefault();
      },
      { passive: false },
    );
  }

  readFrame(): FrameInput {
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
        button.setPointerCapture(event.pointerId);
        this.pointers[direction].add(event.pointerId);
        button.classList.add("pressed");
        if (direction === "jump") this.pendingJump = true;
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
    const side = (x: number): "left" | "right" => {
      const bounds = viewport.getBoundingClientRect();
      return x < bounds.left + bounds.width / 2 ? "left" : "right";
    };
    viewport.addEventListener("pointerdown", (event) => {
      if (
        !this.options.isPlaying() ||
        (event.target as HTMLElement).closest("button")
      )
        return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      this.canvasPointers.set(event.pointerId, side(event.clientX));
    });
    viewport.addEventListener("pointermove", (event) => {
      if (this.canvasPointers.has(event.pointerId))
        this.canvasPointers.set(event.pointerId, side(event.clientX));
    });
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
}
