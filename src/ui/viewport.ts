/** Fit the entire game card, including its measured HUD, inside the visible browser. */
export function fitGameFrame(
  width: number,
  height: number,
  chromeWidth: number,
  chromeHeight: number,
  preferredRatio?: number,
) {
  const innerWidth = Math.max(1, Math.min(500, width) - chromeWidth);
  const innerHeight = Math.max(1, height - chromeHeight);
  const ratio = Math.max(
    9 / 20,
    Math.min(3 / 4, preferredRatio ?? innerWidth / innerHeight),
  );
  const canvasWidth = Math.min(innerWidth, innerHeight * ratio);
  const canvasHeight = canvasWidth / ratio;
  return {
    ratio,
    canvasWidth,
    canvasHeight,
    cardWidth: canvasWidth + chromeWidth,
    cardHeight: canvasHeight + chromeHeight,
  };
}

/** A viewport resize must preserve the player's screen position, even when shrinking. */
export function resizedCamera(
  playerY: number,
  cameraY: number,
  oldHeight: number,
  newHeight: number,
): number {
  const fraction = Math.max(
    0.2,
    Math.min(0.88, (playerY - cameraY) / Math.max(1, oldHeight)),
  );
  return playerY - newHeight * fraction;
}
