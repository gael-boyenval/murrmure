import { describe, expect, test } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { completeDispatchedAction } from "../../../src/invoke/complete-dispatched.js";

describe("invoke/complete-dispatched", () => {
  test("completes a working step and returns outcome result", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "preview-review",
        flow_digest: "sha256:flow",
        lifecycle: "working",
        exec_context: { input: { spec_filename: "hero.md" } },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "working",
      started_at: "2026-01-01T00:00:01.000Z",
    });

    const journalEvents: Array<{ type: string; data?: Record<string, unknown> }> = [];
    const journal = {
      append: async (input: {
        type: string;
        data?: Record<string, unknown>;
      }) => {
        journalEvents.push(input);
      },
    };

    const result = await completeDispatchedAction(studio, journal, {
      run_id: "run_run1",
      step_id: "build",
      action_name: "feature_build",
      actor_id: "act_agent",
      token_id: "tok_agent",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      result: { preview_url: "http://toto.local:3000" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.status).toBe("completed");
    expect(result.outcome.result).toEqual({ preview_url: "http://toto.local:3000" });
    expect(journalEvents.some((e) => e.type === JOURNAL_EVENT_TYPES.ACTION_COMPLETED)).toBe(true);
  });

  test("idempotent when step already completed", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "preview-review",
        flow_digest: "sha256:flow",
        lifecycle: "working",
        exec_context: {
          steps: {
            build: {
              status: "completed",
              output: { preview_url: "http://foobar.local:4321" },
              completed_at: "2026-01-01T00:00:02.000Z",
            },
          },
        },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "completed",
      completed_at: "2026-01-01T00:00:02.000Z",
    });

    const result = await completeDispatchedAction(
      studio,
      { append: async () => undefined },
      {
        run_id: "run_run1",
        step_id: "build",
        actor_id: "act_agent",
        token_id: "tok_agent",
        space_id: "spc_demo",
        result: { preview_url: "http://ignored" },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.result).toEqual({ preview_url: "http://foobar.local:4321" });
    }
  });
});
