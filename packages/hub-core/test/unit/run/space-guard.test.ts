import { describe, expect, test } from "vitest";
import { SpaceConcurrencyGuard } from "../../../src/run/space-guard.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SpaceConcurrencyGuard", () => {
  test("serializes critical sections within a space (order preserved)", async () => {
    const guard = new SpaceConcurrencyGuard();
    const order: string[] = [];

    // Start a slow section, then a fast one. The fast one must wait.
    await Promise.all([
      guard.with("spc_a", async () => {
        await delay(20);
        order.push("first-done");
      }),
      guard.with("spc_a", async () => {
        order.push("second-started");
        await delay(5);
        order.push("second-done");
      }),
    ]);

    expect(order).toEqual(["first-done", "second-started", "second-done"]);
  });

  test("runs different spaces concurrently (no cross-space serialization)", async () => {
    const guard = new SpaceConcurrencyGuard();
    const slowDone: string[] = [];

    const slow = guard.with("spc_slow", async () => {
      await delay(30);
      slowDone.push("slow");
    });
    const fast = guard.with("spc_fast", async () => {
      await delay(5);
      slowDone.push("fast");
    });

    await Promise.all([slow, fast]);
    // fast finished first -> not blocked by slow's per-space lock.
    expect(slowDone).toEqual(["fast", "slow"]);
  });

  test("returns the section value", async () => {
    const guard = new SpaceConcurrencyGuard();
    const value = await guard.with("spc_a", async () => 42);
    expect(value).toBe(42);
  });

  test("a failed section does not break the chain for the next waiter", async () => {
    const guard = new SpaceConcurrencyGuard();
    const first = guard.with("spc_a", async () => {
      throw new Error("boom");
    });
    await expect(first).rejects.toThrow("boom");

    // Next section must still run.
    const second = await guard.with("spc_a", async () => "recovered");
    expect(second).toBe("recovered");
  });

  test("accepts bare or prefixed space ids as the same key", async () => {
    const guard = new SpaceConcurrencyGuard();
    const order: string[] = [];
    await Promise.all([
      guard.with("spc_a", async () => {
        await delay(15);
        order.push("prefixed");
      }),
      guard.with("a", async () => {
        order.push("bare");
      }),
    ]);
    expect(order).toEqual(["prefixed", "bare"]);
  });
});
