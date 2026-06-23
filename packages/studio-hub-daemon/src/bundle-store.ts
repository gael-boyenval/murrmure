import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { computeBundleDigest, computeFileDigest } from "@murrmure/cli/api";

const ALLOWLIST_ROOTS = [join(homedir(), ".murrmure", "flows"), join(homedir(), ".studio", "capabilities")];

export function resolveAllowlistedPath(localPath: string, hubDataDir: string): string | null {
  const expanded = localPath.startsWith("~") ? join(homedir(), localPath.slice(1)) : resolve(localPath);
  const roots = [...ALLOWLIST_ROOTS, join(hubDataDir, "staging")];
  for (const root of roots) {
    const normalizedRoot = resolve(root);
    if (expanded === normalizedRoot || expanded.startsWith(normalizedRoot + "/")) {
      return expanded;
    }
  }
  return null;
}

export function blobDir(hubDataDir: string, digest: string): string {
  return join(hubDataDir, "blobs", "capability", digest.replace(/^sha256:/, ""));
}

export function sourceBlobPath(hubDataDir: string, flowId: string, version: string): string {
  return join(hubDataDir, "blobs", "sources", flowId, version, "source.tar.zst");
}

export async function computeDirectoryDigest(dir: string): Promise<string> {
  return computeBundleDigest(dir);
}

export async function ingestLocalBundle(
  hubDataDir: string,
  localPath: string,
  claimedDigest?: string,
): Promise<{ ok: true; digest: string; blobPath: string } | { ok: false; code: string; message: string }> {
  if (!existsSync(localPath)) {
    return { ok: false, code: "BUNDLE_NOT_FOUND", message: `Path not found: ${localPath}` };
  }
  const digest = await computeDirectoryDigest(localPath);
  if (claimedDigest && claimedDigest !== digest) {
    return { ok: false, code: "BUNDLE_DIGEST_MISMATCH", message: "Claimed digest does not match computed digest" };
  }
  const dest = blobDir(hubDataDir, digest);
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
    cpSync(localPath, dest, { recursive: true });
  }
  return { ok: true, digest, blobPath: dest };
}

export async function ingestSourceBlob(
  hubDataDir: string,
  flowId: string,
  version: string,
  sourcePath: string,
  claimedDigest?: string,
): Promise<{ ok: true; digest: string; blobPath: string } | { ok: false; code: string; message: string }> {
  if (!existsSync(sourcePath)) {
    return { ok: false, code: "SOURCE_BUNDLE_MISSING", message: `Source bundle not found: ${sourcePath}` };
  }
  const digest = await computeFileDigest(sourcePath);
  if (claimedDigest && claimedDigest !== digest) {
    return { ok: false, code: "BUNDLE_DIGEST_MISMATCH", message: "Claimed source digest does not match computed digest" };
  }
  const dest = sourceBlobPath(hubDataDir, flowId, version);
  mkdirSync(join(dest, ".."), { recursive: true });
  if (!existsSync(dest)) {
    cpSync(sourcePath, dest);
  }
  return { ok: true, digest, blobPath: dest };
}

export function readBundleManifest(blobPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(blobPath, "manifest.json"), "utf-8")) as Record<string, unknown>;
}

export function assignContractRefId(packageId: string, contract: Record<string, unknown>): string {
  const ver = String(contract.schemaVersion ?? contract.schema_version ?? "1");
  const major = ver.split(".")[0] ?? "1";
  return `cref_${packageId.replace(/-/g, "_")}_${major}`;
}
