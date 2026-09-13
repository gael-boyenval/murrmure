import { describe, expect, test } from "vitest";
import {
  JOURNAL_EVENT_TYPES,
  MURRMURE_DENIAL_CODES,
  MeetingChairSchema,
  MeetingConveneBodySchema,
  MeetingSaidDataSchema,
  MeetingToSchema,
  MeetingTranscriptSchema,
  MessageIdSchema,
  ParticipantIdSchema,
  PersonaIdSchema,
  PersonasFileSchema,
} from "../src/index.js";

const PTC = "ptc_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PTC_B = "ptc_01ARZ3NDEKTSV4RRFFQ69G5FBW";
const MSG = "msg_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SPC = "spc_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("meetings/personas schema", () => {
  test("accepts a valid personas file", () => {
    const parsed = PersonasFileSchema.parse({
      version: 1,
      personas: [
        {
          id: "researcher",
          summary: "Technical research and prior art",
          asks: ["literature / papers on a topic"],
          requests: ["attach a written brief"],
        },
      ],
    });
    expect(parsed.personas).toHaveLength(1);
    expect(parsed.personas[0]?.id).toBe("researcher");
  });

  test("rejects duplicate persona ids in the file", () => {
    const parsed = PersonasFileSchema.safeParse({
      version: 1,
      personas: [
        { id: "designer", summary: "Product design" },
        { id: "designer", summary: "Another designer" },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  test("persona id regex", () => {
    expect(PersonaIdSchema.safeParse("designer").success).toBe(true);
    expect(PersonaIdSchema.safeParse("qa-lead").success).toBe(true);
    expect(PersonaIdSchema.safeParse("r1").success).toBe(true);
    expect(PersonaIdSchema.safeParse("Designer").success).toBe(false);
    expect(PersonaIdSchema.safeParse("1designer").success).toBe(false);
    expect(PersonaIdSchema.safeParse("").success).toBe(false);
    expect(PersonaIdSchema.safeParse("a".repeat(65)).success).toBe(false);
  });
});

describe("meetings/ids and journal types", () => {
  test("ptc_* and msg_* ids", () => {
    expect(ParticipantIdSchema.safeParse(PTC).success).toBe(true);
    expect(MessageIdSchema.safeParse(MSG).success).toBe(true);
    expect(ParticipantIdSchema.safeParse("ptc_not-a-ulid").success).toBe(false);
    expect(MessageIdSchema.safeParse("msg_not-a-ulid").success).toBe(false);
    expect(ParticipantIdSchema.safeParse("ses_01ARZ3NDEKTSV4RRFFQ69G5FAV").success).toBe(false);
  });

  test("mrmr.meeting.* journal types", () => {
    expect(JOURNAL_EVENT_TYPES.MEETING_CONVENED).toBe("mrmr.meeting.convened");
    expect(JOURNAL_EVENT_TYPES.MEETING_SAID).toBe("mrmr.meeting.said");
    expect(JOURNAL_EVENT_TYPES.MEETING_DELIVERED).toBe("mrmr.meeting.delivered");
    expect(JOURNAL_EVENT_TYPES.MEETING_DELIVERY_FAILED).toBe("mrmr.meeting.delivery_failed");
    expect(JOURNAL_EVENT_TYPES.MEETING_CLOSED).toBe("mrmr.meeting.closed");
    expect(JOURNAL_EVENT_TYPES.MEETING_RESUMED).toBe("mrmr.meeting.resumed");
  });

  test("meeting denial codes", () => {
    expect(MURRMURE_DENIAL_CODES.NOT_MEETING_MEMBER).toBe("NOT_MEETING_MEMBER");
    expect(MURRMURE_DENIAL_CODES.MEETING_CLOSED).toBe("MEETING_CLOSED");
    expect(MURRMURE_DENIAL_CODES.MEETING_CHAIR_REQUIRED).toBe("MEETING_CHAIR_REQUIRED");
    expect(MURRMURE_DENIAL_CODES.REPLY_UNKNOWN).toBe("REPLY_UNKNOWN");
    expect(MURRMURE_DENIAL_CODES.PARTICIPANT_AMBIGUOUS).toBe("PARTICIPANT_AMBIGUOUS");
    expect(MURRMURE_DENIAL_CODES.MEETING_ALREADY_OPEN).toBe("MEETING_ALREADY_OPEN");
    expect(MURRMURE_DENIAL_CODES.TO_AMBIGUOUS).toBe("TO_AMBIGUOUS");
    expect(MURRMURE_DENIAL_CODES.TO_EMPTY).toBe("TO_EMPTY");
    expect(MURRMURE_DENIAL_CODES.MEETING_SESSION_REQUIRED).toBe("MEETING_SESSION_REQUIRED");
  });
});

describe("meetings/convene and to xor", () => {
  test("accepts convene body with seat chair", () => {
    const parsed = MeetingConveneBodySchema.parse({
      title: "API shape",
      goal: "Pick an approach",
      session_id: SES,
      participants: [
        { space_id: SPC, persona: "designer" },
        { space_id: SPC, persona: "qa" },
      ],
      chair: { space_id: SPC, persona: "designer" },
    });
    expect(parsed.participants).toHaveLength(2);
    expect(parsed.chair).toEqual({ space_id: SPC, persona: "designer" });
  });

  test("accepts human chair", () => {
    expect(MeetingChairSchema.safeParse({ human: true }).success).toBe(true);
    expect(MeetingChairSchema.safeParse({ space_id: SPC }).success).toBe(true);
    expect(MeetingChairSchema.safeParse({ human: true, space_id: SPC }).success).toBe(false);
  });

  test("to is xor list / all", () => {
    expect(MeetingToSchema.safeParse({ participant_ids: [PTC] }).success).toBe(true);
    expect(MeetingToSchema.safeParse({ all: true }).success).toBe(true);
    expect(MeetingToSchema.safeParse({ all: true, participant_ids: [PTC] }).success).toBe(false);
    expect(MeetingToSchema.safeParse({}).success).toBe(false);
    expect(MeetingToSchema.safeParse({ participant_ids: [] }).success).toBe(false);
  });

  test("said requires text or artifacts", () => {
    expect(
      MeetingSaidDataSchema.safeParse({
        as_participant_id: PTC,
        to: { all: true },
        text: "hello",
      }).success,
    ).toBe(true);
    expect(
      MeetingSaidDataSchema.safeParse({
        as_participant_id: PTC,
        to: { participant_ids: [PTC_B] },
        artifacts: ["xfr_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      }).success,
    ).toBe(true);
    expect(
      MeetingSaidDataSchema.safeParse({
        as_participant_id: PTC,
        to: { all: true },
      }).success,
    ).toBe(false);
  });

  test("transcript DTO", () => {
    const parsed = MeetingTranscriptSchema.parse({
      session_id: SES,
      status: "open",
      roster: [{ participant_id: PTC, space_id: SPC, persona: "designer" }],
      chair: { participant_id: PTC },
      goal: "Pick an approach for the public list endpoint",
      since_seq: 0,
      up_to_seq: 2,
      messages: [
        {
          message_id: MSG,
          seq: 2,
          created_at: "2026-08-17T15:00:00.000Z",
          from: { participant_id: PTC, space_id: SPC, persona: "designer", label: "designer@spc_app" },
          to: { all: true, participant_ids: [PTC_B] },
          text: "hello",
          addressed_to_you: false,
          receipts: [{
            participant_id: PTC_B,
            status: "delivered",
            recorded_at: "2026-08-17T15:00:00.025Z",
            latency_ms: 25,
          }],
        },
      ],
    });
    expect(parsed.messages[0]?.to.all).toBe(true);
    expect(parsed.messages[0]?.receipts[0]?.status).toBe("delivered");
    expect(parsed.goal).toBe("Pick an approach for the public list endpoint");
    expect(
      MeetingTranscriptSchema.safeParse({
        session_id: SES,
        status: "open",
        roster: [{ participant_id: PTC, space_id: SPC }],
        chair: { human: true },
        since_seq: 0,
        up_to_seq: 0,
        messages: [],
      }).success,
    ).toBe(true);
  });
});
