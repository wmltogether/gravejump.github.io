import { Container } from "pixi.js";

/** Transparent damage accents stay below every interactive game object. */
export function createSceneLayers() {
  const root = new Container({ label: "scene" });
  const background = new Container({ label: "background" });
  const effects = new Container({ label: "transparent-effects" });
  const gameplay = new Container({ label: "unfiltered-gameplay" });
  root.addChild(background, effects, gameplay);
  return { root, background, effects, gameplay };
}
