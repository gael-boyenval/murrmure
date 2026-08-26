import { describe, expect, it, vi } from "vitest";
import { ShellClientHttpError } from "@murrmure/shell-client";
import {
  DIRECTIVE_FLOW_ID,
  eligibleSelectionState,
  isTerminalRunLifecycle,
  runResultMessage,
  setEligibleSpaces,
  startDirectiveRuns,
  toggleSpaceId,
} from "./start-directive.js";

describe("start-directive", () => {
  it("toggles space selection and select-all", () => {
    const one = toggleSpaceId(new Set(), "spc_a");
    expect([...one]).toEqual(["spc_a"]);
    expect([...toggleSpaceId(one, "spc_a")]).toEqual([]);
    expect([...setEligibleSpaces(new Set(["spc_skip"]), ["spc_a", "spc_b"], true)]).toEqual([
      "spc_skip",
      "spc_a",
      "spc_b",
    ]);
    expect(eligibleSelectionState(new Set(["spc_a"]), ["spc_a", "spc_b"])).toBe("indeterminate");
    expect(eligibleSelectionState(new Set(["spc_a", "spc_b"]), ["spc_a", "spc_b"])).toBe(true);
  });

  it("reads the resolve message from run detail", () => {
    expect(isTerminalRunLifecycle("working")).toBe(false);
    expect(isTerminalRunLifecycle("completed")).toBe(true);
    expect(runResultMessage({ result: { message: "pong" } })).toBe("pong");
    expect(
      runResultMessage({
        exec_context: { steps: { execute: { output: { message: "from context" } } } },
      }),
    ).toBe("from context");
  });

  it("fans out one runFlow per space and keeps per-space errors", async () => {
    const runFlow = vi
      .fn()
      .mockResolvedValueOnce({ session: { session_id: "ses_a" }, run_id: "run_a" })
      .mockRejectedValueOnce(new ShellClientHttpError(404, { message: "Flow not indexed" }, "failed"));

    const rows = await startDirectiveRuns({
      runFlow,
      prompt: "  Say pong  ",
      spaceIds: ["spc_a", "spc_b"],
    });

    expect(runFlow).toHaveBeenCalledWith(DIRECTIVE_FLOW_ID, {
      space_id: "spc_a",
      input: { prompt: "Say pong" },
    });
    expect(rows).toEqual([
      { space_id: "spc_a", ok: true, run_id: "run_a", session_id: "ses_a" },
      { space_id: "spc_b", ok: false, error: "Flow not indexed" },
    ]);
  });
});
