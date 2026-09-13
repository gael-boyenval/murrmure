import { describe, expect, test } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import {
  buildMeetingWakeData,
  formatLiveSaidPrompt,
  renderMurrmureMeetingProtocolEnvelope,
} from "../../../src/meetings/assignment-prompt.js";

const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PTC = "ptc_01ARZ3NDEKTSV4RRFFQ69G5FAD";
const MSG = "msg_01ARZ3NDEKTSV4RRFFQ69G5FA1";

describe("meetings/assignment-prompt", () => {
  test("renders murrmure.meeting/v1 with trigger ids and since_seq", () => {
    const prior = "Empty state breaks this flow.";
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      message_id: MSG,
      trigger: "said",
      since_seq: 0,
    });

    expect(protocol.startsWith("Protocol: murrmure.meeting/v1")).toBe(true);
    expect(protocol).toContain(`session_id: ${SES}`);
    expect(protocol).toContain(`participant_id: ${PTC}`);
    expect(protocol).toContain(`message_id: ${MSG}`);
    expect(protocol).toContain("since_seq: 0");
    expect(protocol).toContain("murrmure_meeting_transcript");
    expect(protocol).toContain("murrmure_emit_event");
    expect(protocol).not.toContain(prior);
    expect(protocol).not.toContain("then call murrmure_resolve_step");
    expect(protocol).toContain("Do not call murrmure_resolve_step for this room");
  });

  test("does not reuse the step envelope operating rule", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      message_id: MSG,
      trigger: "said",
      since_seq: 12,
    });
    expect(protocol).not.toContain("Protocol: murrmure.agent/v1");
    expect(protocol).not.toContain("murrmure_get_pending_wake");
    expect(protocol).not.toContain("## Contracts");
    expect(protocol).toContain("since_seq: 12");
  });

  test("convene wake has no message_id and says invited", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      trigger: "convened",
      since_seq: 0,
      subject: "KB goal check\nread the desk",
    });
    expect(protocol).toContain("trigger: convened");
    expect(protocol).toContain("You were invited");
    expect(protocol).toContain("This process is your seat");
    expect(protocol).toContain("make one concise initial contribution");
    expect(protocol).toContain("Do not start work");
    expect(protocol).toContain("goal: KB goal check read the desk");
    expect(protocol).toContain("subject: KB goal check read the desk");
    expect(protocol).toContain("authoritative");
    expect(protocol).toContain("without waiting for a chair repeat");
    expect(protocol).not.toContain("message_id:");
  });

  test("resumed wake keeps the same seat and asks to continue", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      trigger: "resumed",
      since_seq: 0,
    });
    expect(protocol).toContain("trigger: resumed");
    expect(protocol).toContain("This room resumed");
    expect(protocol).toContain("same session_id and participant_id");
    expect(protocol).toContain("Continue only if the chair or the meeting goal");
    expect(protocol).not.toContain("You were invited");
  });

  test("said wake says already joined, not a new invite", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      message_id: MSG,
      trigger: "said",
      since_seq: 3,
    });
    expect(protocol).toContain("already joined");
    expect(protocol).toContain("addressed_to_you");
    expect(protocol).toContain("chair or the meeting goal");
    expect(protocol).toContain("not a ticket");
    expect(protocol).toContain("to.participant_ids");
    expect(protocol).not.toContain("You were invited");
  });

  test("later PTY turn includes the human text and protocol envelope", () => {
    const prompt = formatLiveSaidPrompt(
      {
        session_id: SES,
        participant_id: PTC,
        message_id: MSG,
        trigger: "said",
        since_seq: 2,
        goal: "Designer: write the brief",
      },
      { text: "Are you here?", from: { human: true }, to: { all: true } },
    );
    expect(prompt).toContain("from: human chair");
    expect(prompt).toContain("text: Are you here?");
    expect(prompt).toContain("addressed_to_you: true");
    expect(prompt).toContain("Protocol: murrmure.meeting/v1");
    expect(prompt).toContain(`message_id: ${MSG}`);
    expect(prompt).toContain("goal: Designer: write the brief");
  });

  test("wake goal comes from snapshot, not flow session.subject", async () => {
    const studio = new MemoryStudioPersistence();
    const now = "2026-08-17T00:00:00.000Z";
    const goal = "Designer: write the public list brief";
    await studio.insertSession(
      {
        session_id: SES,
        title: "Flow room",
        subject: "flw_meet",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: ["app"],
        actor_id: "actor_alice",
      },
      now,
    );
    await studio.upsertMeetingSnapshot({
      session_id: SES,
      status: "open",
      title: "API shape",
      goal,
      chair: { human: true },
      roster: [{ participant_id: PTC, space_id: "spc_app", persona: "designer" }],
      convene_entry_id: "evt_convene",
      convene_meeting_seq: 1,
      updated_at: now,
    });

    const wake = await buildMeetingWakeData(studio, {
      event_id: "evt_1",
      event_type: JOURNAL_EVENT_TYPES.MEETING_CONVENED,
      space_id: "app",
      payload: {},
      session_id: SES,
      participant_id: PTC,
    });
    expect(wake?.goal).toBe(goal);
    expect(wake?.subject).toBe(goal);
    expect(wake?.goal).not.toBe("flw_meet");
  });

  test("wake goal falls back to convened journal when snapshot is missing", async () => {
    const studio = new MemoryStudioPersistence();
    const now = "2026-08-17T00:00:00.000Z";
    const goal = "QA: file the regression notes";
    const bare = SES.startsWith("ses_") ? SES.slice(4) : SES;
    await studio.insertJournalIndex({
      entry_id: "evt_convene",
      seq: 1,
      space_id: "app",
      type: JOURNAL_EVENT_TYPES.MEETING_CONVENED,
      session_id: bare,
      time: now,
      meeting_seq: 1,
      payload_json: JSON.stringify({
        title: "API shape",
        goal,
        roster: [{ participant_id: PTC, space_id: "spc_app", persona: "designer" }],
        chair: { human: true },
      }),
    });

    const wake = await buildMeetingWakeData(studio, {
      event_id: "evt_1",
      event_type: JOURNAL_EVENT_TYPES.MEETING_RESUMED,
      space_id: "app",
      payload: {},
      session_id: SES,
      participant_id: PTC,
    });
    expect(wake?.trigger).toBe("resumed");
    expect(wake?.goal).toBe(goal);
    expect(wake?.subject).toBe(goal);
  });
});
