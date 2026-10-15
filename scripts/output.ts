import { lstat, realpath, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUTPUT = path.resolve(ROOT, "dist");

/** Delete only this project's generated dist, never a linked or external directory. */
export async function cleanOutput(): Promise<void> {
  const root = await realpath(ROOT);
  if (path.relative(root, OUTPUT) !== "dist")
    throw new Error("Unexpected build output path");
  const info = await lstat(OUTPUT).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return;
  if (
    info.isSymbolicLink() ||
    (await realpath(OUTPUT)) !== path.join(root, "dist")
  )
    throw new Error("Refusing to clean a linked output directory");
  // Keep the directory itself: Windows may hold it as a preview process's cwd.
  for (const entry of await readdir(OUTPUT)) {
    const target = path.join(OUTPUT, entry);
    if (path.dirname(target) !== OUTPUT)
      throw new Error("Unexpected output entry");
    await rm(target, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}
