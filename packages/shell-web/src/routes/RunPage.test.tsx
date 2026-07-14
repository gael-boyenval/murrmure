// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ViewCanvasHostProps } from "../components/ViewCanvasHost.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import type { ShellClient } from "@murrmure/shell-client";
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

const activeHumanRun = {
  run_id: "run_abc",
  session_id: "ses_1",
  flow_id: "flw_demo",
  space_id: "spc_demo",
  lifecycle: "working",
  open_steps: [
    {
      step_id: "review",
      resolver: null,
      branches: [
        { branch: "validated" },
        { branch: "changes_required" },
        { branch: "cancel" },
      ],
    },
  ],
};

function renderRunPage(runRef: { current: typeof activeHumanRun | null }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const mockClient = {
    runs: {
      get: vi.fn().mockImplementation(async () => runRef.current),
      graph: vi.fn().mockResolvedValue({ flow_id: "flw_demo", lanes: [] }),
      resolveStep: vi.fn().mockImplementation(async () => {
        runRef.current = null;
      }),
    },
    gates: {
      listForRun: vi.fn().mockResolvedValue([]),
      resolve: vi.fn(),
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

// View canvas binding is introduced in Task 04; the open-step projection here
// carries no view identity, so the canvas host is not rendered in this slice.
describe.skip("RunPage checkpoint canvas", () => {
  it("cancel resolves step, refetches, and exits canvas when step is no longer open", async () => {
    const runRef = { current: activeHumanRun as typeof activeHumanRun | null };
    renderRunPage(runRef);

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
    const runRef = { current: activeHumanRun as typeof activeHumanRun | null };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const mockClient = {
      runs: {
        get: vi.fn().mockImplementation(async () => runRef.current),
        graph: vi.fn().mockResolvedValue({ flow_id: "flw_demo", lanes: [] }),
        resolveStep: vi.fn(),
      },
      gates: {
        listForRun: vi.fn().mockResolvedValue([]),
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
