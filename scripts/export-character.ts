import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CHARACTER_ART } from "../src/render/CharacterArt.ts";

/** Keep the editable SVG master and all animation layers in sync. */
export async function exportCharacter(
  root: string,
  output: string,
): Promise<void> {
  const master = await readFile(path.join(root, "art/bassist.svg"), "utf8");
  const defs = master.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
  if (!defs) throw new Error("Character SVG is missing shared gradients");
  const layers = {
    "hair-back": "bassist-back.svg",
    body: "bassist-body.svg",
    fringe: "bassist-fringe.svg",
  };
  for (const [layer, filename] of Object.entries(layers)) {
    const match = master.match(
      new RegExp(`<!-- BEGIN ${layer} -->([\\s\\S]*?)<!-- END ${layer} -->`),
    );
    if (!match) throw new Error(`Character SVG layer missing: ${layer}`);
    await writeFile(
      path.join(output, filename),
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CHARACTER_ART.width}" height="${CHARACTER_ART.height}" viewBox="0 0 160 200" fill="none">${defs}${match[1]}</svg>`,
    );
  }
  await writeFile(path.join(output, "bassist.svg"), master);
}
