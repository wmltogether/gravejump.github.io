import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../dist/", import.meta.url));
const html = readFileSync(path.join(output, "index.html"), "utf8");
const elementIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(
  (match) => match[1],
);
assert.equal(
  new Set(elementIds).size,
  elementIds.length,
  "Duplicate HTML/SVG IDs may break controls",
);
for (const reference of html.matchAll(/href="#([^"]+)"/g)) {
  assert.ok(
    elementIds.includes(reference[1]),
    `Missing SVG or anchor target: ${reference[1]}`,
  );
}
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter(
    (file) =>
      !file.startsWith("#") &&
      !file.startsWith("data:") &&
      !file.startsWith("./"),
  );
for (const asset of assets)
  assert.ok(
    existsSync(path.join(output, asset)),
    `Missing output asset: ${asset}`,
  );
assert.ok(html.includes("坟头蹦迪"), "Wrong game title");
assert.ok(
  !html.includes("engine.js") && !html.includes("vendor/pixi"),
  "Obsolete JavaScript source entry",
);
assert.ok(
  existsSync(path.join(output, "app.js.map")),
  "Missing TypeScript debugging source map",
);
console.log(`Production output verified: ${assets.join(", ")} + source map`);

for (const name of [
  "bassist",
  "bassist-back",
  "bassist-body",
  "bassist-fringe",
  "hall-wall",
  "hall-stage",
  "platform",
  "note",
  "cucumber",
  "rocket",
  "penguin",
  "hazard-rock",
  "hazard-statue",
  "hazard-cross",
])
  assert.ok(
    existsSync(path.join(output, name + ".svg")),
    `Missing SVG: ${name}`,
  );
assert.ok(
  !html.includes("auto-jump"),
  "Automatic jumping must not have a toggle",
);
const sources = readFileSync(path.join(output, "app.js.map"), "utf8");
assert.ok(
  sources.includes("grave-damage-glitch"),
  "Missing transparent damage effect",
);

assert.equal(
  (html.match(/data-heart=/g) || []).length,
  5,
  "The health UI must show five hearts",
);

for (const name of [
  "bassist",
  "bassist-back",
  "bassist-body",
  "bassist-fringe",
]) {
  const svg = readFileSync(path.join(output, name + ".svg"), "utf8");
  const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  assert.match(root, /\bwidth="160"/, `${name}: missing explicit SVG width`);
  assert.match(root, /\bheight="200"/, `${name}: missing explicit SVG height`);
}

assert.ok(
  !sources.includes("createDamageFilter"),
  "Obsolete damage shader is still bundled",
);

assert.ok(
  sources.includes("autoDensity: false"),
  "Canvas must not receive fixed inline display dimensions",
);

// Pages publishes the output at a project subpath, not necessarily the domain root.
const pagesBase = new URL("https://wmltogether.github.io/gravejump.github.io/");
for (const asset of assets)
  assert.ok(
    new URL(asset, pagesBase).pathname.startsWith(pagesBase.pathname),
    `Asset escapes Pages project path: ${asset}`,
  );
const expected = new Set([
  ...readdirSync(path.resolve(output, "../public")),
  "bassist.svg",
  "bassist-back.svg",
  "bassist-body.svg",
  "bassist-fringe.svg",
  "app.js",
  "app.js.map",
  "app.js.LEGAL.txt",
  ".nojekyll",
]);
for (const entry of readdirSync(output, { withFileTypes: true }))
  assert.ok(
    entry.isFile() && expected.has(entry.name),
    `Stale or unexpected build output: ${entry.name}`,
  );
