// @vitest-environment jsdom
import { describe, expect, it, test } from "vitest";
import { render } from "@testing-library/react";
import { VIEW_TRANSPORT_VERSION, type ViewAppContext } from "@murrmure/view-sdk";
import { ViewCanvasHost } from "./components/ViewCanvasHost.js";
import {
  shouldShowStepCanvas,
  viewRefFromActiveStep,
} from "./lib/step-view-binding.js";
import type { RunDetailPayload } from "@murrmure/shell-client";

const context: ViewAppContext = {
  flow_id: "flw_intake",
  space_id: "spc_demo",
  hub_base_url: "http://127.0.0.1:8787",
  mode: "production",
  transport_version: VIEW_TRANSPORT_VERSION,
  nonce: "nonce-intake",
  run_id: "run_1",
  step: { step_id: "intake", branches: [{ branch: "approve" }] },
};

describe("Tutorial v3 shell UI conformance", () => {
  it("Task 04 — projected View resolver opens without fallback controls", () => {
    const run = {
      open_steps: [
        {
          step_id: "intake",
          resolver: { handler_id: "hdl_intake", type: "view_resolver", view_id: "intake" },
          view: { view_id: "intake", origin_space_id: "spc_demo", entry: "./dist/index.html" },
          branches: [{ branch: "approve" }],
        },
      ],
    } as unknown as RunDetailPayload;

    expect(shouldShowStepCanvas(run)).toBe(true);
    const viewRef = viewRefFromActiveStep(run.open_steps?.[0]);
    expect(viewRef).toEqual({
      view_id: "intake",
      origin_space_id: "spc_demo",
      entry_url: "./dist/index.html",
      shell_route: undefined,
    });

    const { container } = render(
      <ViewCanvasHost
        title="Intake"
        viewRef={viewRef}
        context={context}
        onSubmitBranch={async () => ({ ok: true } as const)}
      />,
    );

    // The hardened iframe host is mounted; no built-in fallback form is rendered.
    expect(container.querySelector('[data-testid="view-canvas-host"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="view-canvas-observability"]')).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("Task 04 — unbound step stays observability-only (no canvas, no fallback form)", () => {
    const run = {
      open_steps: [
        { step_id: "intake", resolver: null, branches: [{ branch: "approve" }] },
      ],
    } as unknown as RunDetailPayload;

    expect(shouldShowStepCanvas(run)).toBe(false);
    expect(viewRefFromActiveStep(run.open_steps?.[0])).toBeUndefined();
  });

  test.skip("Task 12 — one flow page renders static, live, and pinned history", () => {});
});
