// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import type { ShellClient } from "@murrmure/shell-client";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { MeetingsMenu } from "./MeetingsMenu.js";

afterEach(() => cleanup());

function SessionProbe() {
  const { id } = useParams();
  return <div>Opened {id}</div>;
}

function mockClient(overrides: {
  meetings?: Array<{
    session_id: string;
    title: string;
    goal?: string;
    status: "open" | "closed";
    roster_count: number;
    roster: Array<{ space_id: string; persona?: string }>;
  }>;
  resume?: ReturnType<typeof vi.fn>;
} = {}): ShellClient {
  return {
    spaces: { list: vi.fn().mockResolvedValue([]), personas: vi.fn().mockResolvedValue({ personas: [] }) },
    meetings: {
      start: vi.fn(),
      list: vi.fn().mockResolvedValue({
        meetings: overrides.meetings ?? [
          {
            session_id: "ses_open",
            title: "Live room",
            status: "open",
            roster_count: 1,
            roster: [{ space_id: "spc_app", persona: "designer" }],
          },
          {
            session_id: "ses_closed",
            title: "Yesterday",
            goal: "Ship the API",
            status: "closed",
            roster_count: 1,
            roster: [{ space_id: "spc_app", persona: "designer" }],
          },
        ],
      }),
    },
    sessions: {
      resumeMeeting:
        overrides.resume ??
        vi.fn().mockResolvedValue({
          ok: true,
          session_id: "ses_closed",
          status: "open",
          resume_meeting_seq: 9,
          roster: [],
        }),
    },
  } as unknown as ShellClient;
}

function renderMenu(client: ShellClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={client}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<MeetingsMenu />} />
            <Route path="/sessions/:id" element={<SessionProbe />} />
          </Routes>
        </MemoryRouter>
      </ShellClientContext.Provider>
    </QueryClientProvider>,
  );
}

describe("MeetingsMenu", () => {
  it("always shows Meetings plus a new-meeting control", async () => {
    renderMenu(mockClient({ meetings: [] }));
    expect(screen.getByText("Meetings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New meeting" }));
    expect(await screen.findByTestId("start-meeting-dialog")).toBeTruthy();
  });

  it("lists open and closed rooms and resumes the same session", async () => {
    const resume = vi.fn().mockResolvedValue({
      ok: true,
      session_id: "ses_closed",
      status: "open",
      resume_meeting_seq: 9,
      roster: [],
    });
    renderMenu(mockClient({ resume }));

    fireEvent.click(await screen.findByText("Meetings (1)"));
    expect(await screen.findByText("Live room")).toBeTruthy();
    expect(screen.getByText("Yesterday")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => {
      expect(resume).toHaveBeenCalledWith("ses_closed");
    });
    expect(await screen.findByText("Opened ses_closed")).toBeTruthy();
  });
});
