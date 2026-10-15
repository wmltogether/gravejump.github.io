export const GLITCH_DURATION = 0.5;

/** Bounded presentation clock: one impact never becomes a persistent distortion. */
export class DamagePulse {
  private remaining = 0;
  trigger(): void {
    this.remaining = GLITCH_DURATION;
  }
  clear(): void {
    this.remaining = 0;
  }
  advance(dt: number, reducedMotion: boolean): number {
    this.remaining = Math.max(0, this.remaining - Math.max(0, dt));
    // Hold the impact for 100ms so it survives a few mobile display frames.
    const strength = Math.min(1, this.remaining / (GLITCH_DURATION - 0.1));
    return strength * (reducedMotion ? 0.12 : 1);
  }
}
