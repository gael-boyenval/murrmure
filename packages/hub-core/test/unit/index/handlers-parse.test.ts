import { describe, expect, test } from "vitest";
import {
  buildHandlerIndex,
  matchStepOpenedHandlers,
  matchStepResolvedHandlers,
  matchEventHandlers,
  parseHandlersFile,
} from "../../../src/index/parse-handlers.js";

describe("index/parse-handlers", () => {
  test("parses on::key aliases and indexes step.opened handlers", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        {
          id: "write-spec",
          contract_keys: ["preview-review.write_spec"],
          on: "step.opened::preview-review.write_spec",
          type: "shell_spawn",
          complete: "explicit",
          command: "cursor agent -p --force {{prompt}}",
        },
        {
          id: "brief-wake",
          on: { event: { type: "brief.requested" } },
          type: "mcp_session",
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const index = buildHandlerIndex(parsed.value);
    const matches = matchStepOpenedHandlers(index, "preview-review.write_spec");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("write-spec");
    expect(matchStepOpenedHandlers(index, "preview-review.intake")).toHaveLength(0);
  });

  test("indexes step.resolved reactions separately and allows many", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        {
          id: "log-intake",
          on: "step.resolved::preview-review.intake",
          type: "shell_spawn",
          command: "echo done",
        },
        {
          id: "notify-intake",
          on: "step.resolved::preview-review.intake",
          type: "shell_spawn",
          command: "echo notify",
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const index = buildHandlerIndex(parsed.value);
    expect(matchStepResolvedHandlers(index, "preview-review.intake")).toHaveLength(2);
  });

  test("matches event handlers by type and source", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        { id: "brief-wake", on: { event: { type: "brief.requested" } }, type: "mcp_session" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(matchEventHandlers(parsed.value.handlers, { event_type: "brief.requested", source: "/spaces/spc_x" })).toHaveLength(1);
    expect(matchEventHandlers(parsed.value.handlers, { event_type: "other", source: "/spaces/spc_x" })).toHaveLength(0);
  });

  test("accepts view_resolver binding with view and no executor fields", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        { id: "intake-view", on: "step.opened::preview-review.intake", type: "view_resolver", view: "intake" },
      ],
    });
    expect(parsed.ok).toBe(true);
  });

  test("rejects lifecycle-only on: step.opened (must use on::key)", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        { id: "legacy", on: "step.opened", type: "shell_spawn", command: "echo" },
      ],
    });
    expect(parsed.ok).toBe(false);
  });

  test("rejects authored kill_on via strict handler validation", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        { id: "killed", on: "step.opened::preview-review.intake", type: "shell_spawn", command: "echo", kill_on: ["step.failed"] } as Record<string, unknown>,
      ],
    });
    expect(parsed.ok).toBe(false);
  });

  test("rejects view_resolver with executor fields (strict)", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        { id: "bad", on: "step.opened::preview-review.intake", type: "view_resolver", view: "intake", command: "echo" } as Record<string, unknown>,
      ],
    });
    expect(parsed.ok).toBe(false);
  });

  test("rejects view_resolver missing view", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        { id: "bad", on: "step.opened::preview-review.intake", type: "view_resolver" } as Record<string, unknown>,
      ],
    });
    expect(parsed.ok).toBe(false);
  });

  test("rejects invalid handlers shape", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        {
          id: "invalid",
          on: "step.opened::preview-review.write_spec",
          type: "shell_spawn",
          contract_keys: "preview-review.write_spec",
        },
      ],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("INVALID_HANDLERS");
    expect(parsed.message).toContain("handlers.yaml");
  });
});
