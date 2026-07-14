import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  buildHandlerIndex,
  matchStepOpenedHandlers,
  parseHandlersFile,
  validateHandlerBindings,
} from "@murrmure/hub-core";
import { parseHandlerStepBinding } from "@murrmure/contracts";
import {
  compileStepContractCatalog,
  parseFlowManifest,
} from "@murrmure/hub-core";
import { loadTutorialSnapshot } from "../../../test-utils/tutorial-v3/snapshots.js";

const ALIAS = "my-dev-flow.intake";

describe("Tutorial v3 handler conformance", () => {
  test("Task 04 — readable aliases resolve to one canonical View handler", () => {
    const snapshot = loadTutorialSnapshot(3);
    const handlersYaml = snapshot.files[".mrmr/space/handlers.yaml"];

    // The exact tutorial handler binds the canonical `on::key` alias — not bare
    // `step.opened`, and not dispatch through `contract_keys`.
    expect(handlersYaml).toContain(`on: step.opened::${ALIAS}`);
    expect(handlersYaml).not.toMatch(/\bon: step\.opened\b(?!::)/);
    expect(handlersYaml).toContain("type: view_resolver");
    expect(handlersYaml).toContain("view: spec-intake");
    expect(handlersYaml).not.toMatch(/kill_on|contract_keys:/);

    // The alias parses to one canonical step identity.
    expect(parseHandlerStepBinding(`step.opened::${ALIAS}`)).toEqual({
      lifecycle: "opened",
      alias: ALIAS,
    });

    // The authored handler strict-parses and indexes to exactly one step.opened
    // resolver for the canonical step.
    const parsed = parseHandlersFile(parseYaml(handlersYaml));
    expect(parsed.ok, "handlers.yaml strict-parses").toBe(true);
    if (!parsed.ok) return;
    const index = buildHandlerIndex(parsed.value);
    const opened = matchStepOpenedHandlers(index, ALIAS);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ type: "view_resolver", view: "spec-intake" });
    // No other step.opened resolver binds the same canonical step.
    expect(
      parsed.value.handlers.filter(
        (h) => parseHandlerStepBinding(h.on)?.lifecycle === "opened",
      ),
    ).toHaveLength(1);

    // The atomic binding gate accepts the canonical binding against a built View
    // and the candidate flow, and rejects a duplicate resolver, an orphan alias,
    // and a missing View.
    const handlers = parsed.value.handlers;
    const flows = [{ name: "my-dev-flow", step_ids: ["intake"] }];
    const builtView = { view_id: "spec-intake", build: { dist_present: true, entry_present: true } };

    expect(validateHandlerBindings({ handlers, flows, views: [builtView] })).toEqual({ ok: true });

    const duplicate = validateHandlerBindings({
      handlers: [
        ...handlers,
        { id: "dup", on: `step.opened::${ALIAS}`, type: "view_resolver", view: "spec-intake" },
      ],
      flows,
      views: [builtView],
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("HANDLER_RESOLVER_CONFLICT");

    const orphan = validateHandlerBindings({
      handlers: [{ id: "stale", on: "step.opened::renamed-flow.intake", type: "view_resolver", view: "spec-intake" }],
      flows,
      views: [builtView],
    });
    expect(orphan.ok).toBe(false);
    if (!orphan.ok) expect(orphan.code).toBe("HANDLER_ORPHAN_ALIAS");

    const missingView = validateHandlerBindings({
      handlers,
      flows,
      views: [],
    });
    expect(missingView.ok).toBe(false);
    if (!missingView.ok) expect(missingView.code).toBe("VIEW_RESOLVER_VIEW_NOT_FOUND");
  });

  test("Task 04 — dev fixture branches match the compiled reference manifest", () => {
    const snapshot = loadTutorialSnapshot(3);

    // Compile the reference catalog from the tutorial manifest.
    const manifestResult = parseFlowManifest(
      parseYaml(snapshot.files[".mrmr/flows/my-dev-flow/flow.manifest.yaml"]),
    );
    expect(manifestResult.ok, "manifest parses").toBe(true);
    if (!manifestResult.ok) return;
    const { catalog } = compileStepContractCatalog(manifestResult.value, "flw_my_dev_flow");
    expect(catalog, "catalog compiles").not.toBeNull();
    if (!catalog) return;

    const intake = catalog.entries.find((e) => e.step_id === "intake");
    expect(intake, "intake step in catalog").toBeDefined();
    if (!intake) return;
    const manifestBranchNames = Object.keys(intake.branches ?? {}).sort();

    // The dev fixture's branch contracts are tied to the compiled catalog —
    // fixtures never free-float or override the server projection.
    const fixture = JSON.parse(
      snapshot.files[".mrmr/views/spec-intake/dev/fixtures/intake.json"],
    ) as { step?: { branches?: Array<{ branch: string }> } };
    expect(Array.isArray(fixture.step?.branches)).toBe(true);
    const fixtureBranchNames = (fixture.step?.branches ?? [])
      .map((b) => b.branch)
      .sort();
    expect(fixtureBranchNames).toEqual(manifestBranchNames);
    expect(fixtureBranchNames).toEqual(["cancel", "continue"]);
  });

  test.skip("Task 06 — Part 5 copy materializes and quotes one safe argument", () => {});
  test.skip("Task 07 — build prompt is versioned and branch-complete", () => {});
  test.skip("Task 11 — run scratch retention preserves references, not paths", () => {});
});
