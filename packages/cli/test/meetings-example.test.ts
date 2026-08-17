import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { readSpaceApplyBundle } from "../src/lib/space-directory.js";
import { lintSpaceApplyBundle, strictLintFailures } from "@murrmure/hub-core";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function assertStrictApply(spaceRoot: string) {
  expect(existsSync(join(spaceRoot, ".mrmr"))).toBe(true);
  const bundle = readSpaceApplyBundle(spaceRoot);
  expect(strictLintFailures(lintSpaceApplyBundle(bundle))).toEqual([]);
}

describe("meetings example fixtures", () => {
  test("meetings-app and meetings-research strict-apply", () => {
    assertStrictApply(join(REPO_ROOT, "test-utils/spaces/meetings-app"));
    assertStrictApply(join(REPO_ROOT, "test-utils/spaces/meetings-research"));
  });
});
