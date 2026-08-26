// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import type { ShellClient } from "@murrmure/shell-client";
import { ShellClientHttpError } from "@murrmure/shell-client";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { StartMeetingDialog } from "./StartMeetingDialog.js";

afterEach(() => cleanup());

function SessionProbe() {
  const { id } = useParams();
  return <div>Opened {id}</div>;
}

function mockClient(overrides: {
  start?: ReturnType<typeof vi.fn>;
  personas?: Record<string, Array<{ id: string; summary: string }>>;
} = {}): ShellClient {
  const start =
    overrides.start ??
    vi.fn().mockResolvedValue({
      ok: true,
      session_id: "ses_room",
      status: "open",
      title: "API shape",
      chair: { human: true },
      roster: [],
      convene_meeting_seq: 1,
    });
  const personas = overrides.personas ?? {
    spc_app: [
      { id: "designer", summary: "Product design" },
      { id: "qa", summary: "Quality" },
    ],
    spc_research: [{ id: "researcher", summary: "Prior art" }],
  };
  return {
    spaces: {
      list: vi.fn().mockResolvedValue([
        { space_id: "spc_app", name: "App", slug: "app" },
        { space_id: "spc_research", name: "Research", slug: "research" },
      ]),
      personas: vi.fn(async (spaceId: string) => ({ personas: personas[spaceId] ?? [] })),
    },
    meetings: { start, list: vi.fn().mockResolvedValue({ meetings: [] }) },
  } as unknown as ShellClient;
}

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        New meeting
      </button>
      <StartMeetingDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function renderDialog(client: ShellClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={client}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<DialogHarness />} />
              <Route path="/sessions/:id" element={<SessionProbe />} />
            </Routes>
          </MemoryRouter>
        </ShellClientContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "New meeting" }));
  expect(await screen.findByTestId("start-meeting-dialog")).toBeTruthy();
  expect(await screen.findByText("designer")).toBeTruthy();
}

describe("StartMeetingDialog", () => {
  it("lists personas per space and starts a human-chair meeting", async () => {
    const start = vi.fn().mockResolvedValue({
      ok: true,
      session_id: "ses_room",
      status: "open",
      title: "API shape",
      chair: { human: true },
      roster: [],
      convene_meeting_seq: 1,
    });
    renderDialog(mockClient({ start }));

    await openDialog();
    expect(screen.getByText("App")).toBeTruthy();
    expect(screen.getByText("Research")).toBeTruthy();
    expect(screen.getByText("Product design")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start meeting" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText(/designer/));
    fireEvent.click(screen.getByLabelText(/researcher/));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "API shape" } });
    fireEvent.change(screen.getByLabelText("What should they work on?"), {
      target: { value: "Pick an approach" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start meeting" }));

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith({
        title: "API shape",
        goal: "Pick an approach",
        participants: [
          { space_id: "spc_app", persona: "designer" },
          { space_id: "spc_research", persona: "researcher" },
        ],
        chair: { human: true },
      });
    });
    expect(await screen.findByText("Opened ses_room")).toBeTruthy();
  });

  it("selects every persona in a space from the space checkbox", async () => {
    renderDialog(mockClient());
    await openDialog();

    fireEvent.click(screen.getByLabelText("App"));
    expect(screen.getByLabelText(/designer/).getAttribute("data-state")).toBe("checked");
    expect(screen.getByLabelText(/qa/).getAttribute("data-state")).toBe("checked");
    expect(screen.getByRole("button", { name: "Start meeting" })).toHaveProperty("disabled", false);
  });

  it("shows convene errors", async () => {
    const start = vi.fn().mockRejectedValue(
      new ShellClientHttpError(404, { code: "PERSONA_NOT_FOUND", message: "unknown persona" }, "failed"),
    );
    renderDialog(mockClient({ start }));
    await openDialog();
    fireEvent.click(screen.getByLabelText(/designer/));
    fireEvent.click(screen.getByRole("button", { name: "Start meeting" }));
    expect((await screen.findByRole("alert")).textContent).toBe("unknown persona");
  });
});
