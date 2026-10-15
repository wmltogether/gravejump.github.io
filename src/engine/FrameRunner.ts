import { C } from "./config.ts";
import type { Game } from "./Game.ts";
import type { FrameInput } from "./types.ts";

/** Fixed 120 Hz simulation, independent of requestAnimationFrame / monitor rate. */
export class FrameRunner {
  readonly game: Game;
  accumulator = 0;
  pendingJump = false;

  constructor(game: Game) {
    this.game = game;
  }

  reset(): void {
    this.accumulator = 0;
    this.pendingJump = false;
  }

  advance(elapsed: number, input: FrameInput = {}): number {
    if (this.game.status !== "playing") {
      this.reset();
      return 0;
    }
    // Preserve a press on a render frame that has no physics step (e.g. 144 Hz).
    if (input.jumpPressed) this.pendingJump = true;
    // A stalled/background tab must not simulate seconds of unattended danger.
    this.accumulator += Math.min(Math.max(elapsed, 0), C.MAX_FRAME_CATCHUP);
    let count = 0;
    while (this.accumulator + 1e-10 >= C.FIXED_DT) {
      this.game.step(C.FIXED_DT, { ...input, jumpPressed: this.pendingJump });
      this.pendingJump = false;
      this.accumulator -= C.FIXED_DT;
      count++;
    }
    return count;
  }
}
