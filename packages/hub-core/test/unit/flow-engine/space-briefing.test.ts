import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { SpaceApplyBundle } from "@murrmure/contracts";
import {
  readSpaceBriefingExcerpt,
  renderSpaceBriefingMarkdown,
  spaceBriefingAbsPath,
  writeSpaceBriefingFile,
} from "../../../src/flow-engine/space-briefing.js";

describe("space briefing", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  test("renderSpaceBriefingMarkdown lists actions, flows, and MCP tools", () => {
    const bundle: SpaceApplyBundle = {
      actions: {
        digest: "abc",
        file: {
          version: 1,
          actions: {
            feature_build: { executor: "shell", command: "cursor agent" },
            feature_write_spec: { executor: "shell" },
          },
        },
      },
      flows: [
        {
          flow_id: "flw_preview_review",
          digest: "def",
          rel_path: "flows/preview-review/flow.manifest.yaml",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "preview-review",
            steps: [
              { id: "intake", presentation: { view: "preview-review-intake" }, branches: {} },
              {
                id: "build",
                executor: { action: "feature_build" },
                branches: {},
                steps: [
                  { id: "build-loop", branches: {} },
                  { id: "review", branches: {} },
                ],
              },
            ],
          },
        },
      ],
    };

    const md = renderSpaceBriefingMarkdown(bundle, "spc_test");
    expect(md).toContain("feature_build");
    expect(md).toContain("preview-review");
    expect(md).toContain("murrmure_resolve_step");
    expect(md).toContain("`intake`");
    expect(md).toContain("`build.build-loop`");
    expect(md).toContain("[view: preview-review-intake]");
  });

  test("writeSpaceBriefingFile and readSpaceBriefingExcerpt round-trip", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "space-briefing-"));
    const bundle: SpaceApplyBundle = {
      actions: {
        digest: "abc",
        file: {
          version: 1,
          actions: { feature_archive: { executor: "shell" } },
        },
      },
    };

    const written = await writeSpaceBriefingFile(tempDir, bundle, "spc_demo");
    expect(written).toBe(spaceBriefingAbsPath(tempDir));
    expect(readFileSync(written, "utf-8")).toContain("feature_archive");

    const excerpt = await readSpaceBriefingExcerpt(tempDir);
    expect(excerpt).toContain("feature_archive");
  });

  test("readSpaceBriefingExcerpt truncates long briefings", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "space-briefing-"));
    const longBody = "x".repeat(20_000);
    const bundle: SpaceApplyBundle = {};
    const base = renderSpaceBriefingMarkdown(bundle, "spc_long");
    await writeSpaceBriefingFile(tempDir, bundle, "spc_long");
    const path = spaceBriefingAbsPath(tempDir);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, `${base}\n${longBody}`, "utf-8");

    const excerpt = await readSpaceBriefingExcerpt(tempDir, 500);
    expect(excerpt).toContain("briefing truncated");
    expect(excerpt!.length).toBeLessThan(600);
  });
});
