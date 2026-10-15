import type { Sprite } from "pixi.js";
import { C } from "../engine/config.ts";

/** Coordinates in the editable SVG, independent of its rasterized texture size. */
export const CHARACTER_ART = Object.freeze({
  width: 160,
  height: 200,
  scale: C.PLAYER_SCALE,
  footX: 80,
  footY: 188,
  hairPivotX: 76,
  hairPivotY: 50,
});

/** Anchor the soles at the physics origin, including lower-resolution textures. */
export function placeCharacterLayer(sprite: Sprite, backHair = false): void {
  const art = CHARACTER_ART;
  sprite.width = art.width * art.scale;
  sprite.height = art.height * art.scale;
  sprite.anchor.set(
    (backHair ? art.hairPivotX : art.footX) / art.width,
    (backHair ? art.hairPivotY : art.footY) / art.height,
  );
  sprite.position.set(
    backHair ? (art.hairPivotX - art.footX) * art.scale : 0,
    backHair ? (art.hairPivotY - art.footY) * art.scale : 0,
  );
}

export const PLATFORM_ART = Object.freeze({
  height: 42,
  surfaceY: 2,
  displayHeight: 35,
});
