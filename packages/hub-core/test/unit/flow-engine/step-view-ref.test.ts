import { describe, expect, test } from "vitest";
import type { RunStepMemo, StepContractCatalog } from "@murrmure/contracts";
import { enrichCatalogViewRefs, findActiveHumanStep } from "../../../src/flow-engine/step-view-ref.js";

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
        role: "human",
        branches: {
          continue: { routes: [{ engine: "open", step_id: "write_spec" }] },
        },
        presentation: { view: "intake-view" },
      },
      {
        step_id: "review",
        parent_id: null,
        role: "human",
        branches: {
          validated: { routes: [{ engine: "advance" }] },
        },
        presentation: { view: "review-view" },
      },
    ],
  };

  test("enrichCatalogViewRefs denormalizes view_ref from apply bundle", () => {
    const cat = structuredClone(catalog);
    enrichCatalogViewRefs(cat, [
      {
        view_id: "intake-view",
        rel_path: "views/intake/view.manifest.yaml",
        digest: "sha256:v",
        manifest: {
          apiVersion: "murrmure.view/v1",
          id: "intake-view",
          entry: "./dist/index.html",
          shell_route: "murrmure/intake",
        },
      },
    ], "spc_demo");

    expect(cat.entries[0]?.presentation?.view_ref).toEqual({
      view_id: "intake-view",
      origin_space_id: "spc_demo",
      entry_url: "./dist/index.html",
      shell_route: "murrmure/intake",
    });
  });

  test("findActiveHumanStep returns awaiting_human memo with view_ref", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "completed" },
      {
        run_id: "run_1",
        step_id: "review",
        status: "awaiting_human",
      },
    ];
    const cat = structuredClone(catalog);
    cat.entries[1]!.presentation!.view_ref = {
      view_id: "review-view",
      origin_space_id: "spc_demo",
      entry_url: "./dist/index.html",
    };

    const active = findActiveHumanStep(memos, cat, "spc_demo");
    expect(active?.step_id).toBe("review");
    expect(active?.view_ref?.view_id).toBe("review-view");
    expect(active?.branch_names).toContain("validated");
  });

  test("findActiveHumanStep synthesizes view_ref when catalog lacks denormalized ref", () => {
    const memos: RunStepMemo[] = [
      { run_id: "run_1", step_id: "intake", status: "awaiting_human" },
    ];
    const active = findActiveHumanStep(memos, structuredClone(catalog), "spc_demo");
    expect(active?.step_id).toBe("intake");
    expect(active?.view_ref).toEqual({
      view_id: "intake-view",
      origin_space_id: "spc_demo",
      entry_url: "./dist/index.html",
    });
  });
});
