import { createHash } from "node:crypto";
import { createReadStream, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Sidecar files excluded from bundle digest (SDK + hub must stay in sync). */
export const BUNDLE_DIGEST_EXCLUDED = [
  ".push-state.json",
  "build.meta.json",
  "bundle.digest",
  "bundle.tar.zst",
] as const;

const EXCLUDED = new Set<string>(BUNDLE_DIGEST_EXCLUDED);

function isExcludedRelativePath(rel: string): boolean {
  return EXCLUDED.has(rel) || rel.endsWith(".push-state.json");
}

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = relative(base, full);
    if (isExcludedRelativePath(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full, base));
    } else {
      out.push(rel);
    }
  }
  return out;
}

export async function computeBundleDigest(stageDir: string): Promise<string> {
  const files = listFiles(stageDir);
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(join(stageDir, rel));
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}
