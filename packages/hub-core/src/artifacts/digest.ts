import { createHash } from "node:crypto";

/** SHA-256 digest for raw artifact bytes (rev-1 §7.3). */
export function computeBytesDigest(bytes: Uint8Array | Buffer): string {
  const hash = createHash("sha256");
  hash.update(bytes);
  return `sha256:${hash.digest("hex")}`;
}
