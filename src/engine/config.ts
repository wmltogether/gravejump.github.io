/** All gameplay tuning is in seconds, world pixels, and world pixels / second. */
export const C = Object.freeze({
  WIDTH: 840,
  HEIGHT: 740,
  START_FLOOR_Y: 650,
  PIXELS_TO_METERS: 0.25,
  FIXED_DT: 1 / 120,
  GRAVITY: 1660,
  JUMP_SPEED: 755,
  MOVE_SPEED: 340,
  ACCEL: 2500,
  COYOTE: 0.11,
  BUFFER: 0.15,
  AUTO_DELAY: 0.075,
  INVULNERABLE: 1.5,
  MAX_LIVES: 5,
  PLAYER_SCALE: 0.6,
  ROCKET_SECONDS: 3,
  ROCKET_ACCEL: 1000,
  ROCKET_MAX_SPEED: 1150,
  PENGUIN_HEIGHT: 42,
  PENGUIN_HALF_WIDTH: 19,
  PENGUIN_THROW_SECONDS: 2.4,
  ROCK_WARNING_SECONDS: 1.05,
  ROCK_GRAVITY: 135,
  MAX_FRAME_CATCHUP: 0.1,
});

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function approach(
  value: number,
  target: number,
  amount: number,
): number {
  return value < target
    ? Math.min(target, value + amount)
    : Math.max(target, value - amount);
}
