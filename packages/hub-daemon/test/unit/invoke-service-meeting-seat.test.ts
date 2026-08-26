import { describe, expect, test, vi } from "vitest";
import {
  compactMeetingShellOutcome,
  InvokeService,
  meetingWakeFromRunExecContext,
} from "../../src/invoke-service.js";
import type { ShellCompleteInput } from "@murrmure/executors";

describe("InvokeService meeting shell completion", () => {
  test("compacts verbose cursor stream JSON below the journal ceiling", () => {
    const compacted = compactMeetingShellOutcome({
      status: "completed",
      result: {
        ok: true,
        stdout: "x".repeat(300_000),
        stderr: "warning".repeat(5_000),
      },
    });
    expect(compacted.result).toMatchObject({
      ok: true,
      stdout_bytes: 300_000,
      stdout_truncated: true,
      stderr_truncated: true,
    });
    expect(Buffer.byteLength(String(compacted.result?.stdout))).toBeLessThanOrEqual(12_000);
    expect(Buffer.byteLength(JSON.stringify(compacted))).toBeLessThan(65_536);
  });

  test("reads the meeting wake from the run's direct exec context", () => {
    expect(
      meetingWakeFromRunExecContext({
        event: {
          type: "mrmr.meeting.convened",
          data: {
            session_id: "ses_room",
            participant_id: "ptc_developer",
            since_seq: 0,
          },
        },
      }),
    ).toMatchObject({
      session_id: "ses_room",
      participant_id: "ptc_developer",
    });
  });

  test("revokes the unique live seat when its one-shot process exits", async () => {
    const revoke = vi.fn(async () => undefined);
    const service = Object.create(InvokeService.prototype) as {
      studio: {
        getRun: (run_id: string) => Promise<Record<string, unknown>>;
      };
      ctx: {
        liveAssignments: {
          revoke: typeof revoke;
        };
      };
      handleShellComplete: (input: ShellCompleteInput) => Promise<void>;
    };
    service.studio = {
      getRun: async () => ({
        space_id: "demo",
        exec_context: {
          event: {
            data: {
              session_id: "ses_room",
              participant_id: "ptc_default_memory",
              trigger: "convened",
              since_seq: 0,
            },
          },
        },
      }),
    };
    service.ctx = { liveAssignments: { revoke } };

    await service.handleShellComplete({
      run_id: "run_seat",
      step_id: "hook:meeting-default",
      action_name: "meeting-default",
      outcome: {
        status: "dispatched",
        run_id: "run_seat",
        step_id: "hook:meeting-default",
      },
    });

    expect(revoke).toHaveBeenCalledWith({
      session_id: "ses_room",
      participant_id: "ptc_default_memory",
    });
  });
});
