import { describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateRunStateQueries } from "./invalidate-run-queries.js";

describe("invalidateRunStateQueries", () => {
  test("invalidates run, graph, gates, session, and journal keys from SSE payload", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    invalidateRunStateQueries(queryClient, {
      space_id: "spc_demo",
      session_id: "ses_abc",
      run_id: "run_xyz",
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["run", "run_xyz"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["run-graph", "run_xyz"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["gates", "run_xyz"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["session", "ses_abc"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["session-runs", "ses_abc"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["journal", "ses_abc", "run_xyz"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["space-home", "spc_demo"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["space", "spc_demo"] });
  });
});
