import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { INLINE_PAYLOAD_MAX_BYTES } from "@murrmure/contracts";

export type PutArtifactInput = {
  bytes: Buffer;
  name: string;
  authorized_readers: string[];
};

export function parsePutArtifactArgs(
  args: Record<string, unknown>,
  input: { spaceId: string; spaceRoot?: string | null },
): PutArtifactInput {
  const hasPath = typeof args.path === "string" && args.path.trim().length > 0;
  const hasContent = typeof args.content === "string";
  if (hasPath === hasContent) {
    throw new Error("exactly one of path or content is required");
  }

  let bytes: Buffer;
  let name: string;
  if (hasPath) {
    if (!input.spaceRoot) {
      throw new Error("space has no local binding to read path");
    }
    const rel = String(args.path).trim();
    bytes = readSpaceRelativeFile(input.spaceRoot, rel);
    name =
      typeof args.name === "string" && args.name.trim()
        ? args.name.trim()
        : basename(rel);
  } else {
    const content = String(args.content);
    if (Buffer.byteLength(content, "utf8") > INLINE_PAYLOAD_MAX_BYTES) {
      throw new Error(
        `content exceeds ${INLINE_PAYLOAD_MAX_BYTES} bytes; use path or PUT /v1/artifacts`,
      );
    }
    bytes = Buffer.from(content, "utf8");
    if (typeof args.name !== "string" || !args.name.trim()) {
      throw new Error("name is required when using content");
    }
    name = args.name.trim();
  }
  if (!name) throw new Error("name is required");

  const requested = Array.isArray(args.authorized_readers)
    ? args.authorized_readers.map((value) => String(value).trim()).filter(Boolean)
    : [];
  return {
    bytes,
    name,
    authorized_readers: requested.length > 0 ? requested : [input.spaceId],
  };
}

export function readSpaceRelativeFile(root: string, rel: string): Buffer {
  if (!rel || rel.includes("\0") || isAbsolute(rel)) {
    throw new Error("path must be relative to the space root");
  }
  const resolved = resolve(root, rel);
  const relToRoot = relative(root, resolved);
  if (!relToRoot || relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    throw new Error("path escapes the space root");
  }
  if (!existsSync(resolved)) {
    throw new Error(`file not found: ${rel}`);
  }
  return readFileSync(resolved);
}
