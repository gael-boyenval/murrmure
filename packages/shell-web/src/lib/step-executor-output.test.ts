import { describe, expect, test } from "vitest";
import {
  buildStepExecutorOutputSections,
  pickDefaultStepId,
} from "./step-executor-output.js";
import type { JournalEntryItem, RunDetailPayload } from "@murrmure/shell-client";

const run: RunDetailPayload = {
  run_id: "run_test",
  session_id: "ses_test",
  lifecycle: "working",
  steps: [
    { step_id: "intake", status: "completed" },
    { step_id: "write_spec", status: "working" },
  ],
  exec_context: {
    steps: {
      intake: { status: "completed", output: { reviewer: "a@b.c" }, completed_at: "2026-07-08T12:00:00Z" },
      write_spec: {
        status: "completed",
        output: { ok: true, stdout: "Copied spec to specs/current/feature.md" },
        completed_at: "2026-07-08T12:01:00Z",
      },
    },
  },
};

describe("step-executor-output", () => {
  test("pickDefaultStepId prefers working step", () => {
    expect(pickDefaultStepId(run)).toBe("write_spec");
  });

  test("formatStepExecutorOutput includes dispatch command and prompt", () => {
    const runWithDispatch: RunDetailPayload = {
      ...run,
      exec_context: {
        steps: {
          write_spec: {
            dispatch: {
              command: "cursor agent -p --force 'Write the spec'",
              prompt: "Write the spec from intake artifact",
              cwd: "/tmp/space",
              dispatched_at: "2026-07-08T12:00:30.000Z",
            },
            output: { ok: true, stdout: "done" },
          },
        },
      },
    };

    const sections = buildStepExecutorOutputSections(runWithDispatch, "write_spec");
    const dispatch = sections.find((s) => s.kind === "data" && s.label === "dispatch");
    expect(dispatch?.kind).toBe("data");
    if (dispatch?.kind === "data") {
      expect(dispatch.value).toMatchObject({
        cwd: "/tmp/space",
        command: "cursor agent -p --force 'Write the spec'",
        prompt: "Write the spec from intake artifact",
      });
    }
  });

  test("formatStepExecutorOutput includes stdout and journal lines", () => {
    const journal: JournalEntryItem[] = [
      {
        id: "1",
        type: "mrmr.action.dispatched",
        time: "2026-07-08T12:00:30.000Z",
        space_id: "spc_demo",
        run_id: "run_test",
        seq: 1,
        data: { step_id: "write_spec", action_name: "feature_write_spec" },
      },
      {
        id: "2",
        type: "mrmr.action.completed",
        time: "2026-07-08T12:01:00.000Z",
        space_id: "spc_demo",
        run_id: "run_test",
        seq: 2,
        data: { step_id: "write_spec", action_name: "feature_write_spec", result: { ok: true } },
      },
    ];

    const sections = buildStepExecutorOutputSections(run, "write_spec", journal);
    const journalSections = sections.filter((s) => s.kind === "data" && s.label.includes("action"));
    expect(journalSections.length).toBeGreaterThanOrEqual(2);
    const stdout = sections.find((s) => s.kind === "data" && s.label === "stdout");
    expect(stdout?.kind).toBe("data");
    if (stdout?.kind === "data") {
      expect(stdout.value).toBe("Copied spec to specs/current/feature.md");
    }
  });

  test("formatStepExecutorOutput shows live stream banner while working", () => {
    const streamingRun: RunDetailPayload = {
      ...run,
      steps: [{ step_id: "write_spec", status: "working" }],
      exec_context: {
        steps: {
          write_spec: {
            output: { streaming: true, stdout: "Thinking...\n", stderr: "warn: slow\n" },
          },
        },
      },
    };
    const sections = buildStepExecutorOutputSections(streamingRun, "write_spec");
    expect(sections.some((s) => s.kind === "text" && s.text.includes("(live stream"))).toBe(true);
    const stdout = sections.find((s) => s.kind === "data" && s.label === "stdout");
    const stderr = sections.find((s) => s.kind === "data" && s.label === "stderr");
    expect(stdout?.kind).toBe("data");
    expect(stderr?.kind).toBe("data");
    if (stdout?.kind === "data") expect(stdout.value).toBe("Thinking...");
    if (stderr?.kind === "data") expect(stderr.value).toBe("warn: slow");
  });

  test("parseStreamOutput expands NDJSON stdout into agent stream", () => {
    const ndjsonRun: RunDetailPayload = {
      ...run,
      exec_context: {
        steps: {
          write_spec: {
            output: {
              stdout: '{"type":"assistant","text":"hi"}\n{"type":"tool","name":"read"}\n',
            },
          },
        },
      },
    };
    const sections = buildStepExecutorOutputSections(ndjsonRun, "write_spec");
    const agent = sections.find((s) => s.kind === "agent_stdout");
    expect(agent?.kind).toBe("agent_stdout");
    if (agent?.kind === "agent_stdout") {
      expect(agent.events.map((e) => e.type)).toEqual(["assistant", "tool"]);
      expect(agent.events[0]?.text).toBe("hi");
      expect(agent.events[1]?.toolName).toBe("read");
    }
  });
});
