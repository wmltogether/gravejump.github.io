import { build } from "esbuild";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportCharacter } from "./export-character.ts";
import { ROOT as root, OUTPUT as output, cleanOutput } from "./output.ts";

await cleanOutput();
await mkdir(output, { recursive: true });
for (const name of await readdir(path.join(root, "public"))) {
  await copyFile(path.join(root, "public", name), path.join(output, name));
}
await exportCharacter(root, output);
await writeFile(path.join(output, ".nojekyll"), "");
await build({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  outfile: path.join(output, "app.js"),
  format: "iife",
  target: "es2022",
  minify: true,
  sourcemap: true,
  legalComments: "linked",
});
console.log(
  "Built dist/: HTML + CSS + bundled PixiJS/TypeScript + source map.",
);
