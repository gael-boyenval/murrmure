import { describe, expect, test } from "vitest";
import {
  buildHandlerIndex,
  matchStepOpenedHandlers,
  parseHandlersFile,
} from "../../../src/index/parse-handlers.js";

describe("index/parse-handlers", () => {
  test("parses handlers file and indexes step.opened keys", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        {
          id: "write-spec",
          contract_keys: ["preview-review.write_spec"],
          on: "step.opened",
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
  });

  test("rejects invalid handlers shape", () => {
    const parsed = parseHandlersFile({
      version: 1,
      handlers: [
        {
          id: "invalid",
          on: "step.opened",
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
