// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { MeetingTranscript } from "@murrmure/shell-client";
import { MeetingTranscriptPane, meetingSeatLabel } from "./MeetingTranscriptPane.js";

afterEach(() => cleanup());

function renderPane(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const transcript: MeetingTranscript = {
  session_id: "ses_room",
  status: "open",
  roster: [
    { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
    { participant_id: "ptc_res", space_id: "spc_research", persona: "researcher" },
    { participant_id: "ptc_qa", space_id: "spc_app", persona: "qa" },
  ],
  chair: { human: true },
  since_seq: 0,
  up_to_seq: 4,
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
    {
      message_id: "msg_2",
      seq: 4,
      created_at: "2026-08-17T15:00:03.500Z",
      from: { participant_id: "ptc_res", space_id: "spc_research", persona: "researcher" },
      to: { all: false, participant_ids: ["ptc_des", "ptc_qa"] },
      in_reply_to: "msg_1",
      text: "brief attached",
      artifacts: ["xfr_brief"],
      receipts: [
        {
          participant_id: "ptc_des",
          status: "delivered",
          recorded_at: "2026-08-17T15:00:03.520Z",
          latency_ms: 20,
        },
        {
          participant_id: "ptc_qa",
          status: "delivered",
          recorded_at: "2026-08-17T15:00:03.525Z",
          latency_ms: 25,
        },
      ],
    },
  ],
};

describe("MeetingTranscriptPane", () => {
  it("renders persona@space labels, receipts, artifact link, and no compose box", () => {
    renderPane(
      <MeetingTranscriptPane
        title="API shape"
        goal="Pick an approach for the public list endpoint"
        transcript={transcript}
      />,
    );

    expect(screen.getByText("API shape")).toBeTruthy();
    expect(screen.getByText("Pick an approach for the public list endpoint")).toBeTruthy();
    expect(screen.getByText("open")).toBeTruthy();
    expect(screen.getAllByText("designer@app").length).toBeGreaterThan(1);
    expect(screen.getAllByText("researcher@research").length).toBeGreaterThan(0);
    expect(screen.getByText(/to researcher@research/)).toBeTruthy();
    expect(screen.getAllByText("Need the last latency study.").length).toBe(2);
    expect(screen.getByText("researcher@research delivered in 25 ms")).toBeTruthy();
    expect(screen.getByText("brief attached")).toBeTruthy();
    expect(screen.queryByText(/re: msg_/)).toBeNull();

    expect(screen.getByTestId("meeting-artifact-xfr_brief")).toBeTruthy();
    expect(screen.getByTestId("meeting-artifacts-rail")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();
  });

  it("minimizes the meeting header", () => {
    renderPane(
      <MeetingTranscriptPane
        title="API shape"
        goal="Pick an approach for the public list endpoint"
        transcript={transcript}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Minimize meeting header" }));
    expect(screen.queryByText("Pick an approach for the public list endpoint")).toBeNull();
    expect(screen.getByText("API shape")).toBeTruthy();
  });

  it("jumps from the artifact rail to the sharing message", () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    renderPane(
      <MeetingTranscriptPane title="API shape" transcript={transcript} />,
    );
    fireEvent.click(screen.getByTestId("meeting-artifacts-rail").querySelector("button")!);
    expect(scroll).toHaveBeenCalled();
    expect(document.getElementById("meeting-msg-msg_2")).toBeTruthy();
    Element.prototype.scrollIntoView = original;
  });

  it("renders markdown and a Reply button when onReply is set", () => {
    const onReply = vi.fn();
    renderPane(
      <MeetingTranscriptPane
        title="API shape"
        transcript={{
          ...transcript,
          messages: [
            {
              ...transcript.messages[0]!,
              text: "Need the **latency** study.",
            },
          ],
        }}
        onReply={onReply}
      />,
    );

    expect(screen.getByText("latency")).toBeTruthy();
    expect(screen.queryByText("Need the **latency** study.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReply).toHaveBeenCalledWith({
      message_id: "msg_1",
      preview: "Need the **latency** study.",
      fromLabel: "designer@app",
      participant_id: "ptc_des",
    });
  });

  it("explains an empty open room has no compose box", () => {
    renderPane(
      <MeetingTranscriptPane
        title="say hello"
        goal="present yourself"
        transcript={{ ...transcript, messages: [], since_seq: 0, up_to_seq: 1 }}
      />,
    );

    expect(screen.getByText(/Seats were spawned on convene/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("formats seat labels as persona@space", () => {
    expect(meetingSeatLabel({ persona: "qa", space_id: "spc_app" })).toBe("qa@app");
    expect(meetingSeatLabel({ persona: "qa", space_id: "spc_01M07GTVBS91S2GER7H9725J44" })).toBe("qa");
    expect(
      meetingSeatLabel(
        { persona: "qa", space_id: "spc_01M07GTVBS91S2GER7H9725J44" },
        { spc_01M07GTVBS91S2GER7H9725J44: "app" },
      ),
    ).toBe("qa@app");
  });

  it("disambiguates the same persona across spaces in messages and receipts", () => {
    const duplicateDefaults: MeetingTranscript = {
      ...transcript,
      roster: [
        { participant_id: "ptc_a", space_id: "spc_memory", persona: "default" },
        { participant_id: "ptc_b", space_id: "spc_harness", persona: "default" },
      ],
      messages: [
        {
          message_id: "msg_defaults",
          seq: 2,
          created_at: "2026-08-17T15:00:00.000Z",
          from: { participant_id: "ptc_a", space_id: "spc_memory", persona: "default" },
          to: { all: false, participant_ids: ["ptc_b"] },
          text: "hello",
          receipts: [{
            participant_id: "ptc_b",
            status: "delivered",
            recorded_at: "2026-08-17T15:00:00.010Z",
            latency_ms: 10,
          }],
        },
      ],
    };

    renderPane(<MeetingTranscriptPane title="Room" transcript={duplicateDefaults} />);

    expect(screen.getAllByText("default@memory").length).toBeGreaterThan(0);
    expect(screen.getByText(/to default@harness/)).toBeTruthy();
    expect(screen.getByText("default@harness delivered in 10 ms")).toBeTruthy();
    expect(screen.getByText("DM")).toBeTruthy();
  });
});
