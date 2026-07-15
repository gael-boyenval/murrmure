// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { VIEW_TRANSPORT_VERSION, type ViewAppContext } from "@murrmure/view-sdk";
import { ViewCanvasHost } from "./components/ViewCanvasHost.js";
import {
  shouldShowStepCanvas,
  viewRefFromActiveStep,
} from "./lib/step-view-binding.js";
import type { RunDetailPayload } from "@murrmure/shell-client";
import { SharedFlowPage } from "./components/SharedFlowPage.js";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

afterEach(() => cleanup());

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

  it("Task 12 — one flow page renders static, live, and pinned history", async () => {
    const queryClient = new QueryClient();
    const graph = {
      run_id: "preview:flw_demo",
      flow_id: "flw_demo",
      flow_digest: "sha256:pinned",
      flow_name: "demo",
      mode: "preview" as const,
      nodes: [
        {
          id: "step:intake",
          step_id: "intake",
          kind: "step_contract",
          metadata: {
            branches: [],
            resolver: null,
            resolver_source: "current" as const,
          },
        },
      ],
      edges: [],
      lanes: [],
      step_memos: [],
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SharedFlowPage
            title="demo"
            status="Applied preview"
            graph={graph}
            onSelectStep={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Applied preview")).toBeTruthy();

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SharedFlowPage
            title="demo"
            status="working"
            graph={{ ...graph, run_id: "run_live", mode: "live" }}
            onSelectStep={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("working")).toBeTruthy();

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SharedFlowPage
            title="demo"
            status="completed"
            graph={{ ...graph, run_id: "run_history", mode: "history" }}
            onSelectStep={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("completed")).toBeTruthy();
    expect(await screen.findByText("intake")).toBeTruthy();
  });

  it("Task 12 — step selection opens and closes the responsive metadata drawer", async () => {
    const queryClient = new QueryClient();
    const graph = {
      run_id: "preview:flw_drawer",
      flow_id: "flw_drawer",
      mode: "preview" as const,
      nodes: [{
        id: "step:intake",
        step_id: "intake",
        kind: "step_contract",
        metadata: {
          branches: [{
            branch: "continue",
            payload_required: [],
            artifact_required: [],
            artifact_slots: {},
            routes: [{ engine: "advance" as const }],
          }],
          resolver: null,
          resolver_source: "current" as const,
        },
      }],
      edges: [],
      lanes: [],
      step_memos: [],
    };

    function Harness() {
      const [stepId, setStepId] = useState<string | undefined>();
      return (
        <SharedFlowPage
          title="drawer"
          graph={graph}
          selectedStepId={stepId}
          onSelectStep={setStepId}
        />
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("rf__node-step:intake"));
    expect(screen.getByRole("dialog", { name: "Step metadata for intake" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Step metadata for intake" })).toBeNull();
  });
});
