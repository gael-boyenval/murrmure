import { describe, expect, test } from "vitest";
import type { RunStepMemo, StepContractCatalog } from "@murrmure/contracts";
import { buildOpenStepProjections } from "../../../src/flow-engine/step-view-ref.js";

describe("flow-engine/step-view-ref", () => {
  const catalog: StepContractCatalog = {
    flow_id: "flw_preview",
    digest: "sha256:test",
    graph_digest: "sha256:graph",
    step_ids: ["intake", "review"],
    entries: [
      {
        step_id: "intake",
        parent_id: null,
        branches: {
          continue: {
            routes: [{ engine: "open", step_id: "write_spec" }],
            schema: { type: "object" },
          },
          cancel: { routes: [{ engine: "fail_run" }], schema: { type: "object" } },
        },
      },
      {
        step_id: "review",
        parent_id: null,
        branches: {
          validated: { routes: [{ engine: "advance" }], schema: { type: "object" } },
        },
      },
    ],
  };

  test("projects working steps as open with resolver null and branch names", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "completed" },
      { run_id: "run_1", step_id: "review", status: "working" },
    ];
    const open = buildOpenStepProjections(memos, catalog);
    expect(open).toHaveLength(1);
    expect(open[0]?.step_id).toBe("review");
    expect(open[0]?.resolver).toBeNull();
    expect(open[0]?.branches.map((b) => b.branch)).toEqual(["validated"]);
  });

  test("projects multiple open steps in memo order", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "working" },
      { run_id: "run_1", step_id: "review", status: "working" },
    ];
    const open = buildOpenStepProjections(memos, catalog);
    expect(open.map((p) => p.step_id)).toEqual(["intake", "review"]);
    expect(open.every((p) => p.resolver === null)).toBe(true);
  });

  test("returns empty when no step is working", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "completed" },
      { run_id: "run_1", step_id: "review", status: "failed" },
    ];
    expect(buildOpenStepProjections(memos, catalog)).toEqual([]);
  });

  test("returns empty when catalog is absent", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "working" },
    ];
    expect(buildOpenStepProjections(memos, null)).toEqual([]);
  });

  test("skips working memos with no catalog entry", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "ghost", status: "working" },
    ];
    expect(buildOpenStepProjections(memos, catalog)).toEqual([]);
  });

  test("projects bound view_resolver resolver and sanitized view ref", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "working" },
    ];
    const open = buildOpenStepProjections(memos, catalog, {
      flow_name: "preview",
      space_id: "spc_local",
      handlers: [
        { id: "intake-view", on: "step.opened::preview.intake", type: "view_resolver", view: "intake", contract_keys: [] },
      ],
      views: [
        {
          view_id: "intake",
          manifest: { apiVersion: "murrmure.view/v1", id: "intake", entry: "./dist/index.html", shell_route: "murrmure/intake" },
        },
      ],
    });
    expect(open).toHaveLength(1);
    expect(open[0]?.resolver).toEqual({ handler_id: "intake-view", type: "view_resolver", view_id: "intake" });
    expect(open[0]?.view).toEqual({
      view_id: "intake",
      origin_space_id: "spc_local",
      entry: "./dist/index.html",
      shell_route: "murrmure/intake",
    });
  });

  test("resolver projection carries no command, prompt, or secret", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "working" },
    ];
    const open = buildOpenStepProjections(memos, catalog, {
      flow_name: "preview",
      space_id: "spc_local",
      handlers: [
        {
          id: "intake-exec",
          on: "step.opened::preview.intake",
          type: "shell_spawn",
          complete: "explicit",
          command: "secret-command",
          prompt: "secret-prompt",
          contract_keys: [],
        },
      ],
    });
    expect(open[0]?.resolver).toEqual({ handler_id: "intake-exec", type: "shell_spawn" });
    const resolver = open[0]?.resolver as Record<string, unknown> | null;
    expect(resolver).not.toHaveProperty("command");
    expect(resolver).not.toHaveProperty("prompt");
  });
});
