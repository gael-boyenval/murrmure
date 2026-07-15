import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Recursively sum the bytes of every regular file under `path`. Used by quota
 * accounting and retention GC metrics. Symlinks and special files are skipped
 * (directories are traversed, non-directory non-file entries ignored). A
 * missing directory yields `0` rather than throwing, so quota/GC over a tree
 * that was just removed or never created is safe.
 */
export async function directoryBytes(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      total += await directoryBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}
