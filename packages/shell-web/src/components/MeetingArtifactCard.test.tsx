// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ShellClient } from "@murrmure/shell-client";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { MeetingArtifactCard } from "./MeetingArtifactCard.js";

afterEach(() => cleanup());

describe("MeetingArtifactCard", () => {
  it("shows name, size, and markdown preview", async () => {
    const client = {
      sessions: {
        getMeetingArtifact: vi.fn().mockResolvedValue({
          artifact: {
            transfer_id: "xfr_note",
            name: "note.md",
            size_bytes: 18,
            digest: "sha256:demo",
          },
          preview: { text: "Hello **team**", truncated: false, name: "note.md" },
        }),
      },
    } as unknown as ShellClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={client}>
          <MeetingArtifactCard transferId="xfr_note" sessionId="ses_room" />
        </ShellClientContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("note.md")).toBeTruthy();
    });
    expect(screen.getByText(/18 bytes/)).toBeTruthy();
    expect(screen.getByText("team")).toBeTruthy();
    expect(client.sessions.getMeetingArtifact).toHaveBeenCalledWith("ses_room", "xfr_note", {
      preview: true,
    });
  });

  it("opens a modal and can reply with a cite", async () => {
    const onReply = vi.fn();
    const client = {
      sessions: {
        getMeetingArtifact: vi.fn().mockResolvedValue({
          artifact: {
            transfer_id: "xfr_note",
            name: "note.md",
            size_bytes: 18,
            digest: "sha256:demo",
          },
          preview: { text: "Hello **team**", truncated: false, name: "note.md" },
        }),
      },
    } as unknown as ShellClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={client}>
          <MeetingArtifactCard
            transferId="xfr_note"
            sessionId="ses_room"
            onReply={onReply}
            messageId="msg_1"
            fromLabel="designer@app"
            participantId="ptc_des"
          />
        </ShellClientContext.Provider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Expand note.md" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
    expect(onReply).toHaveBeenCalledWith({
      message_id: "msg_1",
      participant_id: "ptc_des",
      preview: "note.md",
      fromLabel: "designer@app",
      cite: { transfer_id: "xfr_note", name: "note.md" },
    });
  });
});
