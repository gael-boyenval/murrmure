import { describe, expect, test } from "vitest";
import { observeDevHubHealth } from "../src/dev-hub-health.js";

describe("dev Hub health supervision", () => {
  test("allows a short watch restart and resets after recovery", () => {
    const first = observeDevHubHealth({}, { healthy: false, now: 1_000, grace_ms: 5_000 });
    expect(first).toEqual({ state: { unhealthy_since: 1_000 }, failed: false });

    const waiting = observeDevHubHealth(first.state, {
      healthy: false,
      now: 5_999,
      grace_ms: 5_000,
    });
    expect(waiting.failed).toBe(false);

    expect(
      observeDevHubHealth(waiting.state, {
        healthy: true,
        now: 6_000,
        grace_ms: 5_000,
      }),
    ).toEqual({ state: {}, failed: false });
  });

  test("fails the dev stack after the grace period", () => {
    const first = observeDevHubHealth({}, { healthy: false, now: 1_000, grace_ms: 5_000 });
    expect(
      observeDevHubHealth(first.state, {
        healthy: false,
        now: 6_000,
        grace_ms: 5_000,
      }).failed,
    ).toBe(true);
  });
});
