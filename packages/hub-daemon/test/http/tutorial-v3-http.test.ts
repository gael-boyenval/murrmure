import { describe, expect, test } from "vitest";
import { createTemporaryHub } from "../../../../test-utils/tutorial-v3/helpers.js";

describe("Tutorial v3 HTTP conformance", () => {
  test("Task 00 — temporary Hub roots and ports are isolated", async () => {
    const first = await createTemporaryHub();
    const second = await createTemporaryHub();
    try {
      expect(first.root).not.toBe(second.root);
      expect(first.dataDir).not.toBe(second.dataDir);
      expect(first.baseUrl).not.toBe(second.baseUrl);
    } finally {
      await Promise.all([first.stop(), second.stop()]);
    }
  });

  test("Task 01 — a fresh Hub has zero persisted product objects", async () => {
    const hub = await createTemporaryHub();
    try {
      expect(hub.productCounts()).toEqual({
        spaces: 0,
        contracts: 0,
        installs: 0,
        flows: 0,
      });
    } finally {
      await hub.stop();
    }
  });

  test.skip("Task 03 — start and externally resolve the Part 2 flow", () => {});
  test.skip("Task 05 — upload intent and resolve errors are transport-neutral", () => {});
  test.skip("Task 09 — run admission and apply quiescence are atomic", () => {});
  test.skip("Task 11 — retained local artifacts never expose host paths", () => {});
});

