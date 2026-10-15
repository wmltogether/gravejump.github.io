import { C, clamp } from "./config.ts";
import type { CollisionBody, CollisionHazard, RectHitbox } from "./types.ts";

/** Segment vs box, using slab entry/exit intervals. This also catches tunneling. */
export function segmentAABB(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  let enter = 0;
  let exit = 1;
  const axes = [
    [x0, x1 - x0, minX, maxX],
    [y0, y1 - y0, minY, maxY],
  ];
  for (const [start, delta, min, max] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return false;
      continue;
    }
    let a = (min - start) / delta;
    let b = (max - start) / delta;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    exit = Math.min(exit, b);
    if (enter > exit) return false;
  }
  return true;
}

function segmentCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? clamp(((cx - x0) * dx + (cy - y0) * dy) / lengthSquared, 0, 1)
    : 0;
  return (x0 + dx * t - cx) ** 2 + (y0 + dy * t - cy) ** 2 <= radius ** 2;
}

/** Chibi face, jacket and boots. Flowing hair and the bass neck are cosmetic. */
// Existing silhouette coordinates were authored at 0.74 SVG scale.
const bodyScale = C.PLAYER_SCALE / 0.74;
const HITBOXES: readonly RectHitbox[] = [
  { x: -3, y: -88, w: 42, h: 38 },
  { x: -3, y: -54, w: 30, h: 38 },
  { x: -13, y: -14, w: 13, h: 28 },
  { x: 11, y: -14, w: 13, h: 28 },
].map((box) => ({
  x: box.x * bodyScale,
  y: box.y * bodyScale,
  w: box.w * bodyScale,
  h: box.h * bodyScale,
}));

/**
 * Exact circle-vs-rectangle sweep via the Minkowski sum: two side rectangles
 * plus four corner circles. A plain expanded AABB incorrectly hits near corners.
 */
export function sweepRoundedRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  box: RectHitbox,
): boolean {
  const left = box.x - box.w / 2;
  const top = box.y - box.h / 2;
  const right = left + box.w;
  const bottom = top + box.h;
  if (
    segmentAABB(x0, y0, x1, y1, left - radius, top, right + radius, bottom) ||
    segmentAABB(x0, y0, x1, y1, left, top - radius, right, bottom + radius)
  )
    return true;
  return [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ].some(([cx, cy]) => segmentCircle(x0, y0, x1, y1, cx, cy, radius));
}

/** Relative motion catches fast hazards AND a moving player crossing a rock. */
export function hazardHitsPlayer(
  rock: CollisionHazard,
  player: CollisionBody,
): boolean {
  // Compound circles follow the rendered silhouette instead of one oversized box.
  if (rock.kind === "statue" || rock.kind === "cross") {
    const parts =
      rock.kind === "statue"
        ? [
            { x: 0, y: -0.45, r: 0.43 },
            { x: 0, y: 0.55, r: 0.5 },
            { x: -0.42, y: 0.98, r: 0.21 },
            { x: 0, y: 0.98, r: 0.21 },
            { x: 0.42, y: 0.98, r: 0.21 },
          ]
        : [
            { x: 0, y: -0.8, r: 0.28 },
            { x: 0, y: -0.28, r: 0.3 },
            { x: 0, y: 0.28, r: 0.28 },
            { x: 0, y: 0.82, r: 0.28 },
            { x: -0.55, y: -0.28, r: 0.28 },
            { x: 0.55, y: -0.28, r: 0.28 },
          ];
    const rotation = rock.rotation ?? 0,
      previous = rock.prevRotation ?? rotation;
    return parts.some((part) =>
      hazardHitsPlayer(
        {
          x:
            rock.x +
            (part.x * Math.cos(rotation) - part.y * Math.sin(rotation)) *
              rock.r,
          y:
            rock.y +
            (part.x * Math.sin(rotation) + part.y * Math.cos(rotation)) *
              rock.r,
          prevX:
            (rock.prevX ?? rock.x) +
            (part.x * Math.cos(previous) - part.y * Math.sin(previous)) *
              rock.r,
          prevY:
            (rock.prevY ?? rock.y) +
            (part.x * Math.sin(previous) + part.y * Math.cos(previous)) *
              rock.r,
          r: part.r * rock.r,
        },
        player,
      ),
    );
  }
  const facing = player.facing ?? 1;
  const x0 = ((rock.prevX ?? rock.x) - (player.prevX ?? player.x)) * facing;
  const y0 = (rock.prevY ?? rock.y) - (player.prevY ?? player.y);
  const x1 = (rock.x - player.x) * facing;
  const y1 = rock.y - player.y;
  // Small generosity margin: visible rock edges may graze without costing a heart.
  return HITBOXES.some((box) =>
    sweepRoundedRect(x0, y0, x1, y1, rock.r * 0.88, box),
  );
}
