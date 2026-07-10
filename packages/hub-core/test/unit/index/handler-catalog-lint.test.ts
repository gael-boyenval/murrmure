import { describe, expect, test } from "vitest";
import { lintHandlerCatalogCoverage } from "../../../src/index/handler-catalog-lint.js";

const flowManifest = {
  apiVersion: "murrmure.flow/v1" as const,
  name: "preview-review",
  start: { manual: true },
  steps: [
    {
      id: "intake",
      presentation: { view: "preview-review-intake" },
      branches: {
        continue: { schema: { type: "object" }, next: "write_spec" },
      },
    },
    {
      id: "write_spec",
      role: "agent",
      branches: {
        completed: { schema: { type: "object" }, next: null },
      },
    },
  ],
};

describe("index/handler-catalog-lint", () => {
  test("reports orphan key and uncovered agent step", () => {
    const warnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        handlers: [
          {
            id: "orphan",
            contract_keys: ["preview-review.unknown_step"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "explicit",
          },
        ],
      },
      flows: [{ flow_id: "flw_preview_review", manifest: flowManifest }],
    });

    expect(warnings.some((w) => w.code === "HANDLER_ORPHAN_KEY")).toBe(true);
    expect(
      warnings.some(
        (w) =>
          (w.code === "HANDLER_MISSING" || w.code === "STEP_UNCOVERED") &&
          w.contract_key === "preview-review.write_spec",
      ),
    ).toBe(true);
  });

  test("reports handler key conflict for one agent step", () => {
    const warnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        handlers: [
          {
            id: "writer-a",
            contract_keys: ["preview-review.write_spec"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "explicit",
          },
          {
            id: "writer-b",
            contract_keys: ["preview-review.write_spec"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "explicit",
          },
        ],
      },
      flows: [{ flow_id: "flw_preview_review", manifest: flowManifest }],
    });

    expect(
      warnings.some(
        (w) => w.code === "HANDLER_KEY_CONFLICT" && w.contract_key === "preview-review.write_spec",
      ),
    ).toBe(true);
  });

  test("warns when complete=cli command does not call mrmr step resolve", () => {
    const warnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        handlers: [
          {
            id: "writer-cli",
            contract_keys: ["preview-review.write_spec"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "cli",
            command: "npm run lint",
          },
        ],
      },
      flows: [{ flow_id: "flw_preview_review", manifest: flowManifest }],
    });
    expect(
      warnings.some((w) => w.code === "HANDLER_COMPLETE_CLI_NO_RESOLVE"),
    ).toBe(true);
  });
});
