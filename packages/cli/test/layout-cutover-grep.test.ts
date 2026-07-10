import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const TARGETS = [
  "packages/cli/src/lib/space-directory.ts",
  "packages/cli/src/lib/space-link-file.ts",
  "packages/cli/src/lib/space-scaffold.ts",
  "packages/cli/src/lib/flow-scaffold.ts",
  "packages/cli/src/lib/view-dev.ts",
  "packages/cli/src/lib/view-scaffold.ts",
  "packages/hub-core/src/flow-engine/step-contract-slice.ts",
  "packages/hub-core/src/flow-engine/step-artifacts.ts",
  "packages/executors/src/invoke-shell-prompt.ts",
  "packages/executors/src/shell-spawn.ts",
  "packages/mcp-bridge/src/wake-relay.ts",
  "packages/hub-daemon/src/invoke-service.ts",
] as const;

const FORBIDDEN_PATTERNS = [
  /\.mrmr\.temp/,
  /\.murrmure\/link\.json/,
  /\.murrmure\/pending-wake\.json/,
];

describe("layout cutover grep guard", () => {
  test("target runtime files no longer reference legacy layout paths", () => {
    for (const relPath of TARGETS) {
      const absPath = join(REPO_ROOT, relPath);
      const source = readFileSync(absPath, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source, `${relPath} should not contain ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
