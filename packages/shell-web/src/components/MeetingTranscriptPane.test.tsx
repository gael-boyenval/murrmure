// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { MeetingTranscript } from "@murrmure/shell-client";
import { MeetingTranscriptPane, meetingSeatLabel } from "./MeetingTranscriptPane.js";

afterEach(() => cleanup());

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
      from: { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
      to: { all: false, participant_ids: ["ptc_res"] },
      text: "Need the last latency study.",
      receipts: [{ participant_id: "ptc_res", status: "delivered" }],
    },
    {
      message_id: "msg_2",
      seq: 4,
      from: { participant_id: "ptc_res", space_id: "spc_research", persona: "researcher" },
      to: { all: false, participant_ids: ["ptc_des", "ptc_qa"] },
      in_reply_to: "msg_1",
      text: "brief attached",
      artifacts: ["xfr_brief"],
      receipts: [
        { participant_id: "ptc_des", status: "delivered" },
        { participant_id: "ptc_qa", status: "delivered" },
      ],
    },
  ],
};

describe("MeetingTranscriptPane", () => {
  it("renders persona@space labels, receipts, artifact link, and no compose box", () => {
    render(
      <MeetingTranscriptPane
        title="API shape"
        goal="Pick an approach for the public list endpoint"
        transcript={transcript}
      />,
    );

    expect(screen.getByText("API shape")).toBeTruthy();
    expect(screen.getByText("Pick an approach for the public list endpoint")).toBeTruthy();
    expect(screen.getByText("open")).toBeTruthy();
    expect(screen.getAllByText("designer@app").length).toBeGreaterThan(0);
    expect(screen.getAllByText("researcher@research").length).toBeGreaterThan(0);
    expect(screen.getByText("Designer")).toBeTruthy();
    expect(screen.getByText(/to Researcher/)).toBeTruthy();
    expect(screen.getAllByText("Need the last latency study.").length).toBe(2);
    expect(screen.getByText("Researcher delivered")).toBeTruthy();
    expect(screen.getByText("brief attached")).toBeTruthy();
    expect(screen.queryByText(/re: msg_/)).toBeNull();

    const artifact = screen.getByRole("link", { name: "xfr_brief" });
    expect(artifact.getAttribute("href")).toContain("/v1/artifacts/xfr_brief");
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
});
