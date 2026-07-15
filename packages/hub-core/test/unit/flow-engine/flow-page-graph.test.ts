import { describe, expect, test } from "vitest";
import type { HandlerSpec, StepContractCatalog } from "@murrmure/contracts";
import { buildRunGraph } from "../../../src/flow-engine/graph.js";
import { buildSafeResolverMap } from "../../../src/flow-engine/step-view-ref.js";

const catalog: StepContractCatalog = {
  flow_id: "flw_truthful",
  digest: "sha256:flow",
  graph_digest: "sha256:graph",
  step_ids: ["intake", "build"],
  entries: [
    {
      step_id: "intake",
      parent_id: null,
      description: "Choose how the run proceeds",
      branches: {
        continue: {
          payload_required: ["spec"],
          artifact_required: [],
          artifact_slots: {},
          schema: { type: "object", required: ["spec"] },
          routes: [{ engine: "open", step_id: "build" }],
        },
        cancel: {
          payload_required: [],
          artifact_required: [],
          artifact_slots: {},
          routes: [{ engine: "fail_run" }],
        },
      },
    },
    {
      step_id: "build",
      parent_id: null,
      branches: {
        completed: {
          payload_required: [],
          artifact_required: [],
          artifact_slots: {},
          routes: [{ engine: "advance" }],
        },
        failed: {
          payload_required: [],
          artifact_required: [],
          artifact_slots: {},
          routes: [{ engine: "fail_run" }],
        },
      },
    },
  ],
};

describe("truthful flow-page graph projection", () => {
  test("custom branches use one decision and every failure shares one terminal", () => {
    const graph = buildRunGraph({
      run_id: "preview:flw_truthful",
      flow_id: catalog.flow_id,
      flow_digest: catalog.digest,
      mode: "preview",
      step_contract_catalog: catalog,
      step_memos: [],
    });

    expect(graph.nodes.filter((node) => node.kind === "decision").map((node) => node.step_id)).toEqual([
      "intake",
    ]);
    expect(graph.nodes.filter((node) => node.kind === "failure_terminal")).toHaveLength(1);
    expect(graph.edges.filter((edge) => edge.tone === "failure").every(
      (edge) => edge.target === "terminal:failed",
    )).toBe(true);
    expect(graph.nodes.find((node) => node.step_id === "build")?.kind).toBe("step_contract");
  });

  test("safe resolver identity pins a digest without exposing implementation fields", () => {
    const handlers: HandlerSpec[] = [
      {
        id: "build-agent",
        on: "step.opened::truthful.build",
        type: "shell_spawn",
        complete: "explicit",
        contract_keys: [],
        command: "cursor agent --secret",
        prompt: "private prompt",
        cwd: "/private/path",
        params: { token: "secret" },
      },
    ];
    const resolvers = buildSafeResolverMap(catalog, "truthful", handlers);

    expect(resolvers.build).toMatchObject({
      handler_id: "build-agent",
      type: "shell_spawn",
    });
    expect(resolvers.build?.config_digest).toMatch(/^sha256:/);
    const serialized = JSON.stringify(resolvers);
    expect(serialized).not.toContain("cursor agent");
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("/private/path");
    expect(serialized).not.toContain("secret");
  });
});
