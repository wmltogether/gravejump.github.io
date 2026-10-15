/** Suppress browser gestures on game surfaces without breaking menu button clicks. */
export function protectGameSurface(
  surface: HTMLElement,
  isPlaying: () => boolean,
): void {
  for (const name of ["contextmenu", "selectstart", "dragstart"] as const)
    surface.addEventListener(name, (event) => event.preventDefault(), {
      capture: true,
    });
  for (const name of ["touchstart", "touchmove", "touchend"] as const)
    surface.addEventListener(
      name,
      (event) => {
        if (isPlaying() && event.cancelable) event.preventDefault();
      },
      { passive: false, capture: true },
    );
  // Safari's gesture events can otherwise turn a multi-finger hold into a zoom.
  for (const name of ["gesturestart", "gesturechange", "dblclick"])
    surface.addEventListener(
      name,
      (event) => {
        if (isPlaying() && event.cancelable) event.preventDefault();
      },
      { capture: true },
    );
}
