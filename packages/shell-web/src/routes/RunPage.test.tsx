// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ViewCanvasHostProps } from "../components/ViewCanvasHost.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import type { GateItem, ShellClient } from "@murrmure/shell-client";
import { RunPage } from "./RunPage.js";

const capturedCanvasProps: ViewCanvasHostProps[] = [];

vi.mock("../components/ViewCanvasHost.js", () => ({
  ViewCanvasHost: (props: ViewCanvasHostProps) => {
    capturedCanvasProps.push(props);
    return (
      <div data-testid="view-canvas-host">
        <button type="button" onClick={() => props.onCancel?.()}>
          Cancel checkpoint
        </button>
      </div>
    );
  },
}));

const pendingGate: GateItem = {
  gate_id: "gte_run",
  run_id: "run_abc",
  session_id: "ses_1",
  step_id: "review",
  status: "pending",
  title: "Review checkpoint",
  view_ref: {
    view_id: "preview-review",
    origin_space_id: "spc_demo",
    entry_url: "./dist/index.html",
  },
};

function renderRunPage(gateStatusRef: { current: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const mockClient = {
    runs: {
      get: vi.fn().mockResolvedValue({
        run_id: "run_abc",
        session_id: "ses_1",
        flow_id: "flw_demo",
        space_id: "spc_demo",
        lifecycle: "working",
      }),
      graph: vi.fn().mockResolvedValue({ flow_id: "flw_demo", lanes: [] }),
    },
    gates: {
      listForRun: vi.fn().mockImplementation(async () => [
        { ...pendingGate, status: gateStatusRef.current },
      ]),
      resolve: vi.fn().mockImplementation(async () => {
        gateStatusRef.current = "cancelled";
      }),
    },
    auth: { mintSseTicket: vi.fn() },
    journal: { subscribe: () => () => undefined },
  } as unknown as ShellClient;

  return render(
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={mockClient}>
        <MemoryRouter initialEntries={["/runs/run_abc"]}>
          <Routes>
            <Route path="/runs/:runId" element={<RunPage />} />
          </Routes>
        </MemoryRouter>
      </ShellClientContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  capturedCanvasProps.length = 0;
});

describe("RunPage checkpoint canvas", () => {
  it("cancel resolves gate, refetches, and exits canvas when gate is terminal", async () => {
    const gateStatusRef = { current: "pending" };
    renderRunPage(gateStatusRef);

    await waitFor(() => {
      expect(screen.getByTestId("view-canvas-host")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel checkpoint" }));

    await waitFor(() => {
      expect(screen.queryByTestId("view-canvas-host")).toBeNull();
      expect(screen.getByRole("heading", { name: "Run" })).toBeTruthy();
    });
  });

  it("keeps stable ViewCanvasHost props across unrelated parent re-renders", async () => {
    const gateStatusRef = { current: "pending" };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const mockClient = {
      runs: {
        get: vi.fn().mockResolvedValue({
          run_id: "run_abc",
          session_id: "ses_1",
          flow_id: "flw_demo",
          space_id: "spc_demo",
          lifecycle: "working",
        }),
        graph: vi.fn().mockResolvedValue({ flow_id: "flw_demo", lanes: [] }),
      },
      gates: {
        listForRun: vi.fn().mockImplementation(async () => [
          { ...pendingGate, status: gateStatusRef.current },
        ]),
        resolve: vi.fn(),
      },
      auth: { mintSseTicket: vi.fn() },
      journal: { subscribe: () => () => undefined },
    } as unknown as ShellClient;

    function Harness() {
      const [, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick((n) => n + 1)}>
            rerender
          </button>
          <RunPage />
        </>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={mockClient}>
          <MemoryRouter initialEntries={["/runs/run_abc"]}>
            <Routes>
              <Route path="/runs/:runId" element={<Harness />} />
            </Routes>
          </MemoryRouter>
        </ShellClientContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(capturedCanvasProps.length).toBeGreaterThan(0);
    });

    const before = capturedCanvasProps[capturedCanvasProps.length - 1];
    fireEvent.click(screen.getByRole("button", { name: "rerender" }));

    await waitFor(() => {
      expect(capturedCanvasProps.length).toBeGreaterThan(1);
    });

    const after = capturedCanvasProps[capturedCanvasProps.length - 1];
    expect(after.onSubmit).toBe(before.onSubmit);
    expect(after.onCancel).toBe(before.onCancel);
    expect(after.context).toBe(before.context);
  });
});
