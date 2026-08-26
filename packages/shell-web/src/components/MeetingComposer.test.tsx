// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MeetingTranscript, ShellClient } from "@murrmure/shell-client";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { MeetingComposer } from "./MeetingComposer.js";

afterEach(() => cleanup());

const transcript: MeetingTranscript = {
  session_id: "ses_room",
  status: "open",
  roster: [
    { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
    { participant_id: "ptc_res", space_id: "spc_research", persona: "researcher" },
  ],
  chair: { human: true },
  since_seq: 0,
  up_to_seq: 2,
  messages: [],
};

function renderComposer(client: ShellClient, replyTo?: {
  message_id: string;
  preview: string;
  fromLabel: string;
  participant_id?: string;
}) {
  const onClearReply = vi.fn();
  render(
    <ShellClientContext.Provider value={client}>
      <MeetingComposer
        sessionId="ses_room"
        transcript={transcript}
        replyTo={replyTo}
        onClearReply={onClearReply}
      />
    </ShellClientContext.Provider>,
  );
  return { onClearReply };
}

describe("MeetingComposer", () => {
  it("sends in_reply_to and targets the parent seat", async () => {
    const client = {
      sessions: { sayMeeting: vi.fn().mockResolvedValue({ ok: true, event_id: "evt_1", seq: 3 }) },
    } as unknown as ShellClient;
    const { onClearReply } = renderComposer(client, {
      message_id: "msg_1",
      preview: "Need the last latency study.",
      fromLabel: "designer@app",
      participant_id: "ptc_des",
    });

    expect(screen.getByText(/Replying to designer@app/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Here is the study." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(client.sessions.sayMeeting).toHaveBeenCalledWith("ses_room", {
        to: { participant_ids: ["ptc_des"] },
        text: "Here is the study.",
        in_reply_to: "msg_1",
      });
    });
    expect(onClearReply).toHaveBeenCalled();
  });

  it("cites an artifact on send", async () => {
    const client = {
      sessions: { sayMeeting: vi.fn().mockResolvedValue({ ok: true, event_id: "evt_2", seq: 4 }) },
    } as unknown as ShellClient;
    renderComposer(client, {
      preview: "note.md",
      fromLabel: "designer@app",
      cite: { transfer_id: "xfr_note", name: "note.md" },
    });

    expect(screen.getByText(/Citing/)).toBeTruthy();
    expect(screen.getByText("note.md")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(client.sessions.sayMeeting).toHaveBeenCalledWith("ses_room", {
        to: { all: true },
        artifacts: ["xfr_note"],
      });
    });
  });
});
