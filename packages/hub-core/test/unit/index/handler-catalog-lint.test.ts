import { describe, expect, test } from "vitest";
import { lintHandlerCatalogCoverage } from "../../../src/index/handler-catalog-lint.js";

const flowManifest = {
  apiVersion: "murrmure.flow/v1" as const,
  name: "preview-review",
  triggers: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches spec markdown.",
      branches: {
        continue: { schema: { type: "object" }, route: { step: "write_spec" } },
      },
    },
    { id: "write_spec", description: "Write the spec." },
  ],
};

describe("index/handler-catalog-lint", () => {
  test("reports orphan prompt-scope contract key for unknown alias", () => {
    const warnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        handlers: [
          {
            id: "orphan",
            contract_keys: ["preview-review.unknown_step"],
            on: "step.opened::preview-review.write_spec",
            type: "shell_spawn",
            complete: "explicit",
          },
        ],
      },
      flows: [{ flow_id: "flw_preview_review", manifest: flowManifest }],
    });

    expect(warnings.some((w) => w.code === "HANDLER_ORPHAN_KEY")).toBe(true);
  });

  test("does not warn for unbound steps (unbound steps are valid)", () => {
    const warnings = lintHandlerCatalogCoverage({
      handlers: { version: 1, handlers: [] },
      flows: [{ flow_id: "flw_preview_review", manifest: flowManifest }],
    });
    expect(warnings.some((w) => w.code === "HANDLER_MISSING" || w.code === "STEP_UNCOVERED")).toBe(false);
  });

  test("warns when complete=cli command does not call mrmr step resolve", () => {
    const warnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        handlers: [
          {
            id: "writer-cli",
            contract_keys: ["preview-review.write_spec"],
            on: "step.opened::preview-review.write_spec",
            type: "shell_spawn",
            complete: "cli",
            command: "npm run lint",
          },
        ],
      },
      flows: [{ flow_id: "flw_preview_review", manifest: flowManifest }],
    });
    expect(warnings.some((w) => w.code === "HANDLER_COMPLETE_CLI_NO_RESOLVE")).toBe(true);
  });

  test("does not lint complete policy for view_resolver", () => {
    const warnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        handlers: [
          {
            id: "intake-view",
            on: "step.opened::preview-review.intake",
            type: "view_resolver",
            view: "intake",
          },
        ],
      },
      flows: [{ flow_id: "flw_preview_review", manifest: flowManifest }],
    });
    expect(warnings.some((w) => w.code === "HANDLER_COMPLETE_CLI_NO_RESOLVE")).toBe(false);
  });
});
