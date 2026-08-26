import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { INLINE_PAYLOAD_MAX_BYTES } from "@murrmure/contracts";
import { parsePutArtifactArgs } from "../../src/mcp-put-artifact.js";

const SPACE = "spc_writer";

describe("mcp-put-artifact", () => {
  test("accepts inline content + name and defaults readers to the caller space", () => {
    const parsed = parsePutArtifactArgs(
      { content: "hello", name: "note.txt" },
      { spaceId: SPACE },
    );
    expect(parsed.name).toBe("note.txt");
    expect(parsed.bytes.toString("utf8")).toBe("hello");
    expect(parsed.authorized_readers).toEqual([SPACE]);
  });

  test("rejects missing xor and content without name", () => {
    expect(() => parsePutArtifactArgs({}, { spaceId: SPACE })).toThrow(
      /exactly one of path or content/,
    );
    expect(() =>
      parsePutArtifactArgs({ content: "x", path: "a.txt" }, { spaceId: SPACE }),
    ).toThrow(/exactly one of path or content/);
    expect(() => parsePutArtifactArgs({ content: "x" }, { spaceId: SPACE })).toThrow(
      /name is required/,
    );
  });

  test("rejects inline content over the journal inline cap", () => {
    expect(() =>
      parsePutArtifactArgs(
        { content: "x".repeat(INLINE_PAYLOAD_MAX_BYTES + 1), name: "big.txt" },
        { spaceId: SPACE },
      ),
    ).toThrow(/65536/);
  });

  test("reads a relative path and rejects escape", () => {
    const root = mkdtempSync(join(tmpdir(), "put-artifact-"));
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "notes", "desk.md"), "canon", "utf8");

    const parsed = parsePutArtifactArgs(
      { path: "notes/desk.md" },
      { spaceId: SPACE, spaceRoot: root },
    );
    expect(parsed.name).toBe("desk.md");
    expect(parsed.bytes.toString("utf8")).toBe("canon");

    expect(() =>
      parsePutArtifactArgs({ path: "../secret" }, { spaceId: SPACE, spaceRoot: root }),
    ).toThrow(/escapes the space root/);
  });
});
