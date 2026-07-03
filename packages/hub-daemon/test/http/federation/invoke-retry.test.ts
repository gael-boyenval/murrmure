import { describe, expect, test } from "vitest";
import { createRemoteHubExecutor } from "@murrmure/executors";

describe("federation/invoke-retry", () => {
  test("three retries then EXECUTOR_UNAVAILABLE", async () => {
    let attempts = 0;
    const executor = createRemoteHubExecutor({
      checkPeerHealth: async () => ({ status: "reachable" }),
      relayInvoke: async () => {
        attempts += 1;
        return { ok: false, http_status: 503, dispatch: { status: "executor_unavailable", detail: "peer down" } };
      },
      sleep: async () => undefined,
    });

    const outcome = await executor.dispatch(
      {
        space_id: "spc_virtual",
        action_name: "echo",
        run_id: "run_test",
        step_id: "action:echo",
      },
      {
        action: { name: "echo" },
        binding: {
          type: "remote_hub",
          executor_id: "remote-exec",
          remote_hub_id: "hub_b",
          remote_space_id: "spc_remote",
        },
      },
    );

    expect(attempts).toBe(3);
    expect(outcome.status).toBe("executor_unavailable");
    expect(outcome.error_code).toBe("EXECUTOR_UNAVAILABLE");
  });
});
