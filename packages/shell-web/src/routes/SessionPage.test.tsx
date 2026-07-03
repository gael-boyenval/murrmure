// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ViewCanvasHostProps } from "../components/ViewCanvasHost.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import type { GateItem, ShellClient } from "@murrmure/shell-client";
import { SessionPage } from "./SessionPage.js";

const capturedCanvasProps: ViewCanvasHostProps[] = [];

vi.mock("../components/ViewCanvasHost.js", () => ({
  ViewCanvasHost: (props: ViewCanvasHostProps) => {
    capturedCanvasProps.push(props);
    return <div data-testid="view-canvas-host" />;
  },
}));

const pendingGate: GateItem = {
  gate_id: "gte_sess",
  run_id: "run_abc",
  session_id: "ses_1",
  step_id: "review",
  status: "pending",
  view_ref: {
    view_id: "preview-review",
    origin_space_id: "spc_demo",
    entry_url: "./dist/index.html",
  },
};

afterEach(() => {
  cleanup();
  capturedCanvasProps.length = 0;
});

describe("SessionPage checkpoint canvas", () => {
  it("keeps stable ViewCanvasHost props across unrelated parent re-renders", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const mockClient = {
      sessions: {
        get: vi.fn().mockResolvedValue({
          session_id: "ses_1",
          title: "Validate homepage",
          status: "active",
        }),
        listRuns: vi.fn().mockResolvedValue({
          runs: [{ run_id: "run_abc", lifecycle: "working" }],
        }),
      },
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
        listForRun: vi.fn().mockResolvedValue([pendingGate]),
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
          <SessionPage />
        </>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={mockClient}>
          <MemoryRouter initialEntries={["/sessions/ses_1"]}>
            <Routes>
              <Route path="/sessions/:sessionId" element={<Harness />} />
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
