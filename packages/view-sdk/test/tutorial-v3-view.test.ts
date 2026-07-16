import { describe, expect, test } from "vitest";
import { validateBranchResolve } from "../src/app/contract.js";
import { VIEW_TRANSPORT_VERSION, type ViewAppContext } from "../src/types.js";
import { loadTutorialSnapshot } from "../../../test-utils/tutorial-v3/snapshots.js";

const BASE_CONTEXT = {
  flow_id: "flw_my_dev_flow",
  space_id: "spc_local",
  hub_base_url: "http://127.0.0.1:8787",
  transport_version: VIEW_TRANSPORT_VERSION,
  nonce: "tutorial-v3-nonce",
} as const;

describe("Tutorial v3 View conformance", () => {
  test("Task 04 — Part 3 receives canonical dev and production context", () => {
    const snapshot = loadTutorialSnapshot(3);
    const fixture = JSON.parse(
      snapshot.files[".mrmr/views/spec-intake/dev/fixtures/intake.json"],
    ) as ViewAppContext;

    // Canonical step projection: `branches` is a server-style array of
    // ViewBranchContract, never the legacy object map the SDK cannot `.find`.
    expect(fixture.step).toBeDefined();
    expect(Array.isArray(fixture.step?.branches)).toBe(true);
    const branches = fixture.step?.branches ?? [];
    expect(branches.map((b) => b.branch).sort()).toEqual(["cancel", "continue"]);
    for (const branch of branches) {
      expect(typeof branch.branch).toBe("string");
      if (branch.schema !== undefined) expect(branch.schema).toBeTypeOf("object");
      if (branch.artifact_slots !== undefined) {
        expect(branch.artifact_slots).toBeTypeOf("object");
      }
    }

    // No legacy non-wire fields survive in the fixture.
    const serialized = JSON.stringify(fixture);
    expect(serialized).not.toMatch(
      /"branch_names"|"payload_required"|"artifact_required"|"route"|"max_files"/,
    );

    // Wire/validation parity: the SDK validation path consumes the dev fixture's
    // contracts. `continue` requires `spec`; `cancel` is open; unknown branches reject.
    const devContext: ViewAppContext = { ...BASE_CONTEXT, mode: "dev", step: fixture.step };
    expect(
      validateBranchResolve(devContext, "continue", {
        files: { spec: new Blob(["# Spec\n"], { type: "text/markdown" }) },
      }),
    ).toBeNull();
    expect(validateBranchResolve(devContext, "cancel", {})).toBeNull();
    expect(validateBranchResolve(devContext, "continue", {})).toMatchObject({
      code: "CONTRACT_VALIDATION_FAILED",
    });
    expect(validateBranchResolve(devContext, "ghost", {})).toMatchObject({
      code: "VIEW_UNKNOWN_BRANCH",
    });

    // Production mode uses the same wire and validation semantics — only `mode`
    // differs, and a production mount never lets a fixture override the projection.
    const productionContext: ViewAppContext = { ...devContext, mode: "production" };
    expect(
      validateBranchResolve(productionContext, "continue", {
        files: { spec: new Blob(["# Spec\n"], { type: "text/markdown" }) },
      }),
    ).toBeNull();
    expect(validateBranchResolve(productionContext, "ghost", {})).toMatchObject({
      code: "VIEW_UNKNOWN_BRANCH",
    });
  });

  test("Task 05 — missing files use normalized field errors", () => {
    const snapshot = loadTutorialSnapshot(3);
    const fixture = JSON.parse(
      snapshot.files[".mrmr/views/spec-intake/dev/fixtures/intake.json"],
    ) as ViewAppContext;
    const context: ViewAppContext = { ...BASE_CONTEXT, mode: "production", step: fixture.step };
    expect(validateBranchResolve(context, "continue", {})).toMatchObject({
      code: "CONTRACT_VALIDATION_FAILED",
      errors: [
        {
          source: "artifact",
          path: "/files/spec",
          rule: "min_files",
        },
      ],
    });
  });
});
