export type GameStatus = "ready" | "playing" | "paused" | "over";
export type EndReason = "" | "hazards" | "fall";
export type HazardKind = "rock" | "statue" | "cross";

export interface FrameInput {
  left?: boolean;
  right?: boolean;
  /** An edge event, consumed by exactly one physics step. Never key-repeat. */
  jumpPressed?: boolean;
  /** The current hold state, used for variable jump height. */
  jumpHeld?: boolean;
}

export interface Player {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  groundId: number | null;
  groundTime: number;
  manualJump: boolean;
  minY: number;
}

export interface Platform {
  id: number;
  x: number;
  baseX: number;
  y: number;
  w: number;
  moving: boolean;
  phase?: number;
}

export interface FallingHazard {
  source?: "sky" | "penguin";
  ownerId?: number;
  /** A newly thrown stone becomes damaging only after leaving its thrower's body. */
  clearedThrower?: boolean;
  vx?: number;
  kind?: HazardKind;
  x: number;
  y: number;
  prevX?: number;
  prevY?: number;
  vy: number;
  r: number;
  rotation: number;
  prevRotation?: number;
  spin: number;
  hit?: boolean;
}

export interface HazardWarning {
  kind?: HazardKind;
  x: number;
  remaining: number;
  r: number;
  id: number;
}

export interface Pickup {
  kind?: "note" | "cucumber" | "rocket" | "star";
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

export interface Penguin {
  id: number;
  platformId: number;
  x: number;
  y: number;
  alive: boolean;
  /** Fixed at spawn; throwing and art never track the player's position. */
  facing: 1 | -1;
  throwTimer: number;
}

export type GameEvent =
  | { type: "jump"; x: number; y: number; manual: boolean }
  | { type: "land" | "note" | "hit"; x: number; y: number }
  | { type: "heal"; x: number; y: number; restored: number }
  | { type: "star"; x: number; y: number; restored: number }
  | { type: "purge"; x: number; y: number }
  | { type: "rocket" | "stomp" | "throw"; x: number; y: number }
  | { type: "hazard" }
  | { type: "music"; tier: number; floor: number }
  | { type: "over"; reason: EndReason; height: number };

export interface GameOptions {
  random?: () => number;
  autoJump?: boolean;
  viewHeight?: number;
}

export interface RectHitbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CollisionBody {
  x: number;
  y: number;
  prevX?: number;
  prevY?: number;
  facing?: 1 | -1;
}

export interface CollisionHazard extends CollisionBody {
  r: number;
  kind?: HazardKind;
  rotation?: number;
  prevRotation?: number;
}
