import { describe, expect, test, vi, beforeEach } from "vitest";

const stopHubChild = vi.fn();

vi.mock("../src/lifecycle.js", () => ({
  stopHubChild,
  waitForHubHealth: vi.fn(),
  detectExistingHub: vi.fn(),
}));

describe("withSidecarStartupCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopHubChild.mockResolvedValue("killed");
  });

  test("stops hub child when startup fails", async () => {
    const hubProcess = { exited: Promise.resolve(), kill: vi.fn() };
    const { withSidecarStartupCleanup } = await import("../src/runner.js");

    await expect(
      withSidecarStartupCleanup(hubProcess as never, async () => {
        throw new Error("Hub did not become ready");
      }),
    ).rejects.toThrow(/did not become ready/i);

    expect(stopHubChild).toHaveBeenCalledWith(hubProcess);
  });

  test("returns startup result without stopping child on success", async () => {
    const hubProcess = { exited: Promise.resolve(), kill: vi.fn() };
    const { withSidecarStartupCleanup } = await import("../src/runner.js");

    const result = await withSidecarStartupCleanup(hubProcess as never, async () => "ready");
    expect(result).toBe("ready");
    expect(stopHubChild).not.toHaveBeenCalled();
  });
});
