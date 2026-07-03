import { describe, expect, test } from "vitest";
import { parseViewManifest } from "../../../src/index/parse-view-manifest.js";
import { buildFlowIndexEntries } from "../../../src/index/apply-index.js";
import type { SpaceApplyBundle } from "@murrmure/contracts";

describe("index/view", () => {
  test("parseViewManifest accepts murrmure.view/v1 manifest", () => {
    const result = parseViewManifest({
      apiVersion: "murrmure.view/v1",
      id: "review-params",
      entry: "./dist/index.html",
      shell_route: "murrmure/review-params",
      params_schema: "schemas/params.json",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("review-params");
      expect(result.value.shell_route).toBe("murrmure/review-params");
    }
  });

  test("parseViewManifest rejects invalid apiVersion", () => {
    const result = parseViewManifest({ apiVersion: "view/v0", id: "x" });
    expect(result.ok).toBe(false);
  });

  test("buildFlowIndexEntries denormalizes view_ref from requires_view", () => {
    const bundle: SpaceApplyBundle = {
      flows: [
        {
          flow_id: "flw_review",
          rel_path: "flows/review/flow.manifest.yaml",
          digest: "sha256:flow",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "review",
            start: { manual: true, requires_view: "review-params" },
            steps: [],
          },
        },
      ],
      views: [
        {
          view_id: "review-params",
          rel_path: "views/review-params/view.manifest.yaml",
          digest: "sha256:view",
          manifest: {
            apiVersion: "murrmure.view/v1",
            id: "review-params",
            shell_route: "murrmure/review-params",
            params_schema: "schemas/params.json",
          },
        },
      ],
    };

    const entries = buildFlowIndexEntries(bundle, "spc_demo");
    expect(entries[0]?.view_ref).toEqual({
      view_id: "review-params",
      origin_space_id: "spc_demo",
      shell_route: "murrmure/review-params",
      params_schema: "schemas/params.json",
    });
  });

  test("buildFlowIndexEntries omits view_ref when view bundle missing", () => {
    const bundle: SpaceApplyBundle = {
      flows: [
        {
          flow_id: "flw_review",
          rel_path: "flows/review/flow.manifest.yaml",
          digest: "sha256:flow",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "review",
            start: { manual: true, requires_view: "review-params" },
            steps: [],
          },
        },
      ],
      views: [],
    };

    const entries = buildFlowIndexEntries(bundle, "spc_demo");
    expect(entries[0]?.view_ref).toBeUndefined();
  });
});
