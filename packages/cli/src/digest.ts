import { createHash } from "node:crypto";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Sidecar files excluded from directory digest walks. */
export const BUNDLE_DIGEST_EXCLUDED = [
  ".flow-push-state.json",
  "build.meta.json",
  "bundle.digest",
  "source.digest",
  "bundle.tar.zst",
  "source.tar.zst",
  "source",
] as const;

const EXCLUDED = new Set<string>(BUNDLE_DIGEST_EXCLUDED);

function isExcludedRelativePath(rel: string): boolean {
  return EXCLUDED.has(rel) || rel.startsWith("source/") || rel.endsWith(".flow-push-state.json");
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

export async function computeFileDigest(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return `sha256:${hash.digest("hex")}`;
}

/** Legacy directory digest — used to verify staged tree consistency before tar creation. */
export async function computeBundleDigest(stageDir: string): Promise<string> {
  const bundleTar = join(stageDir, "bundle.tar.zst");
  if (statSync(bundleTar, { throwIfNoEntry: false })?.isFile()) {
    return computeFileDigest(bundleTar);
  }

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

export function readDigestSidecar(stageDir: string, name: "bundle.digest" | "source.digest"): string {
  return readFileSync(join(stageDir, name), "utf-8").trim();
}
