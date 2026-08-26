// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { MeetingTranscript, ShellClient } from "@murrmure/shell-client";
import type { ViewCanvasHostProps } from "../components/ViewCanvasHost.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { defaultSessionRunId, SessionPage, sessionPaneLabel } from "./SessionPage.js";

const capturedCanvasProps: ViewCanvasHostProps[] = [];

vi.mock("@wterm/react/css", () => ({}));
vi.mock("@wterm/react", async () => {
  const { forwardRef } = await import("react");
  return {
    Terminal: forwardRef(() => <div data-testid="wterm" />),
    useTerminal: () => ({
      ref: { current: null },
      write: () => undefined,
      resize: () => undefined,
      focus: () => undefined,
    }),
  };
});

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
      created_at: "2026-08-17T15:00:00.000Z",
      from: { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
      to: { all: false, participant_ids: ["ptc_res"] },
      text: "Need the last latency study.",
      receipts: [{
        participant_id: "ptc_res",
        status: "delivered",
        recorded_at: "2026-08-17T15:00:00.025Z",
        latency_ms: 25,
      }],
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
    meetings: { start: vi.fn(), list: vi.fn().mockResolvedValue({ meetings: [] }) },
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
      listSeats: vi.fn().mockResolvedValue({
        seats: [
          {
            participant_id: "ptc_des",
            space_id: "spc_app",
            persona: "designer",
            handler_id: "meeting-designer",
            run_id: "run_des",
            live: true,
          },
          {
            participant_id: "ptc_res",
            space_id: "spc_research",
            persona: "researcher",
            handler_id: "meeting-researcher",
            run_id: "run_res",
            live: false,
          },
        ],
      }),
      subscribeSeatPty: vi.fn().mockReturnValue(() => undefined),
      transcript: vi.fn().mockResolvedValue(transcript),
      sayMeeting: vi.fn().mockResolvedValue({ ok: true, event_id: "evt_human", seq: 3 }),
      closeMeeting: vi.fn(),
      resumeMeeting: vi.fn().mockResolvedValue({
        ok: true,
        session_id: "ses_1",
        status: "open",
        resume_meeting_seq: 8,
        roster: [],
      }),
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
  it("labels meeting runs as agent activity and focuses the active turn", () => {
    expect(sessionPaneLabel("flowchart", true)).toBe("Agent activity");
    expect(sessionPaneLabel("flowchart", false)).toBe("Flowchart");
    expect(
      defaultSessionRunId([
        { run_id: "run_done", lifecycle: "completed" },
        { run_id: "run_live", lifecycle: "working" },
      ]),
    ).toBe("run_live");
  });

  it("defaults a meeting session to Transcript", async () => {
    renderSession(mockClient({ transcript: openTranscript }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Transcript" }).getAttribute("aria-selected")).toBe("true");
    });
    expect(screen.getByTestId("meeting-transcript")).toBeTruthy();
    expect(screen.getByText("Need the last latency study.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.queryByText("No journal replay yet.")).toBeNull();
  });

  it("sends a targeted message as the human chair", async () => {
    const client = mockClient({ transcript: openTranscript });
    renderSession(client);

    fireEvent.click(await screen.findByRole("checkbox", { name: "researcher@research" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Can you verify the latency result?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(client.sessions.sayMeeting).toHaveBeenCalledWith("ses_1", {
        to: { participant_ids: ["ptc_res"] },
        text: "Can you verify the latency result?",
      });
    });
  });

  it("replies to a specific message", async () => {
    const client = mockClient({ transcript: openTranscript });
    renderSession(client);

    fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
    expect(screen.getByText(/Replying to designer@app/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Here it is." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(client.sessions.sayMeeting).toHaveBeenCalledWith("ses_1", {
        to: { participant_ids: ["ptc_des"] },
        text: "Here it is.",
        in_reply_to: "msg_1",
      });
    });
  });

  it("lists every roster seat on Agent activity", async () => {
    renderSession(mockClient({ transcript: openTranscript }));

    const activity = await screen.findByRole("tab", { name: "Agent activity" });
    fireEvent.click(activity);

    expect(
      screen.getByText(
        "Each roster seat has its own process. Watch the live PTY here. Later messages reuse that process.",
      ),
    ).toBeTruthy();
    expect(await screen.findByRole("button", { name: /designer@app/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /researcher@research/ })).toBeTruthy();
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
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
  });

  it("keeps a closed meeting readable and offers Resume", async () => {
    const client = mockClient({ transcript: closedTranscript });
    renderSession(client);

    await waitFor(() => {
      expect(screen.getByText("Need the last latency study.")).toBeTruthy();
    });
    expect(screen.getByText("closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => {
      expect(client.sessions.resumeMeeting).toHaveBeenCalledWith("ses_1");
    });
  });
});
