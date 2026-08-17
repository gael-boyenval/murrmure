// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { MeetingTranscript, ShellClient } from "@murrmure/shell-client";
import type { ViewCanvasHostProps } from "../components/ViewCanvasHost.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { SessionPage } from "./SessionPage.js";

const capturedCanvasProps: ViewCanvasHostProps[] = [];

vi.mock("../components/ViewCanvasHost.js", () => ({
  ViewCanvasHost: (props: ViewCanvasHostProps) => {
    capturedCanvasProps.push(props);
    return <div data-testid="view-canvas-host" />;
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
      resolver: { handler_id: "hdl_intake", type: "view_resolver", view_id: "intake" },
      view: {
        view_id: "intake",
        origin_space_id: "spc_demo",
        entry: "./dist/index.html",
      },
      branches: [{ branch: "validated" }],
    },
  ],
};

const openTranscript: MeetingTranscript = {
  session_id: "ses_1",
  status: "open",
  roster: [
    { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
    { participant_id: "ptc_res", space_id: "spc_research", persona: "researcher" },
  ],
  chair: { human: true },
  since_seq: 0,
  up_to_seq: 2,
  messages: [
    {
      message_id: "msg_1",
      seq: 2,
      from: { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
      to: { all: false, participant_ids: ["ptc_res"] },
      text: "Need the last latency study.",
      receipts: [{ participant_id: "ptc_res", status: "delivered" }],
    },
  ],
};

const closedTranscript: MeetingTranscript = {
  ...openTranscript,
  status: "closed",
};

function mockClient(overrides: {
  transcript?: MeetingTranscript | null;
  run?: typeof activeHumanRun | { run_id: string; session_id: string; lifecycle: string; open_steps?: [] };
} = {}): ShellClient {
  const transcript = overrides.transcript === undefined ? null : overrides.transcript;
  const run = overrides.run ?? {
    run_id: "run_abc",
    session_id: "ses_1",
    lifecycle: "working",
    open_steps: [],
  };
  return {
    spaces: { list: vi.fn().mockResolvedValue([]) },
    notifications: { list: vi.fn().mockResolvedValue({ notifications: [], pending_count: 0 }) },
    me: { get: vi.fn().mockResolvedValue({ actor_id: "usr_test" }) },
    sessions: {
      get: vi.fn().mockResolvedValue({
        session_id: "ses_1",
        title: "API shape",
        status: "active",
        subject: "Pick an approach",
      }),
      listRuns: vi.fn().mockResolvedValue({
        runs: [{ run_id: "run_abc", lifecycle: "working" }],
      }),
      transcript: vi.fn().mockResolvedValue(transcript),
      closeMeeting: vi.fn(),
    },
    runs: {
      get: vi.fn().mockResolvedValue(run),
      graph: vi.fn().mockResolvedValue({ flow_id: "flw_demo", lanes: [], nodes: [], edges: [], step_memos: [] }),
      resolveStep: vi.fn(),
    },
    gates: {
      listForRun: vi.fn().mockResolvedValue([]),
      resolve: vi.fn(),
    },
    auth: { mintSseTicket: vi.fn() },
    journal: { subscribe: () => () => undefined, query: vi.fn().mockResolvedValue([]) },
  } as unknown as ShellClient;
}

function renderSession(client: ShellClient, path = "/sessions/ses_1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/sessions/:sessionId" element={<SessionPage />} />
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

describe("SessionPage checkpoint canvas", () => {
  it("keeps stable ViewCanvasHost props across unrelated parent re-renders", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const mock = mockClient({ run: activeHumanRun });

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
        <ShellClientContext.Provider value={mock}>
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
    expect(after.onSubmitBranch).toBe(before.onSubmitBranch);
    expect(after.onCancel).toBe(before.onCancel);
    expect(after.context).toBe(before.context);
    expect(after.context.step?.step_id).toBe("review");
  });
});

describe("SessionPage meeting lens", () => {
  it("defaults a meeting session to Transcript", async () => {
    renderSession(mockClient({ transcript: openTranscript }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Transcript" }).getAttribute("aria-selected")).toBe("true");
    });
    expect(screen.getByTestId("meeting-transcript")).toBeTruthy();
    expect(screen.getByText("Need the last latency study.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps Transcript mounted when a bound View is present (not canvasMode-only)", async () => {
    renderSession(mockClient({ transcript: openTranscript, run: activeHumanRun }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Transcript" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Review" })).toBeTruthy();
      expect(screen.getByTestId("view-canvas-host")).toBeTruthy();
    });

    expect(screen.getByRole("tab", { name: "Transcript" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("meeting-transcript")).toBeTruthy();
    expect(screen.getByText("Observer")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps a closed meeting readable and hides Close", async () => {
    renderSession(mockClient({ transcript: closedTranscript }));

    await waitFor(() => {
      expect(screen.getByText("Need the last latency study.")).toBeTruthy();
    });
    expect(screen.getByText("closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
