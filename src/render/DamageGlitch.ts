import { Graphics } from "pixi.js";

export interface GlitchBar {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
}

/** Sparse edge accents only. There is deliberately no full-screen rectangle. */
export function damageBars(
  width: number,
  height: number,
  time: number,
): GlitchBar[] {
  const bars: GlitchBar[] = [];
  const frame = Math.floor(time * 14);
  const length = Math.min(220, width * 0.27);
  for (let i = 0; i < 5; i++) {
    const jitter = (((frame + i) % 3) - 1) * 5;
    const x = (i % 2 === 0 ? 16 : width - length - 16) + jitter;
    const y = height * (0.15 + i * 0.16) + ((frame + i) % 3) * 8;
    bars.push({ x, y, width: length, height: 8, color: 0x5cf2ed });
    bars.push({
      x: x + 6,
      y: y + 10,
      width: length * 0.65,
      height: 4,
      color: 0xff6cbd,
    });
  }
  return bars;
}

/** Normal alpha blending, no framebuffer sampling or offscreen shader pass. */
export function createDamageGlitch() {
  const view = new Graphics({ label: "grave-damage-glitch" });
  view.alpha = 0;
  view.visible = false;
  view.eventMode = "none";
  return {
    view,
    render(
      strength: number,
      width: number,
      height: number,
      time: number,
      reducedMotion: boolean,
    ): void {
      view.clear();
      const bounded = Number.isFinite(strength)
        ? Math.max(0, Math.min(1, strength))
        : 0;
      view.alpha = reducedMotion ? 0 : bounded * 0.42;
      view.visible = view.alpha > 0;
      if (!view.visible) return;
      for (const bar of damageBars(width, height, time))
        view.rect(bar.x, bar.y, bar.width, bar.height).fill(bar.color);
    },
    clear(): void {
      view.clear();
      view.alpha = 0;
      view.visible = false;
    },
  };
}
