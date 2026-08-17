import { z } from "zod";
import { MessageIdSchema, ParticipantIdSchema, SessionIdSchema, SpaceIdSchema, TransferIdSchema } from "../ids.js";
import { PersonaIdSchema } from "./persona.js";

export const MeetingRosterSeatSchema = z.object({
  space_id: SpaceIdSchema,
  persona: PersonaIdSchema.optional(),
});

export const MeetingChairHumanSchema = z
  .object({
    human: z.literal(true),
  })
  .strict();

export const MeetingChairSeatSchema = z
  .object({
    space_id: SpaceIdSchema,
    persona: PersonaIdSchema.optional(),
  })
  .strict();

export const MeetingChairSchema = z.union([MeetingChairHumanSchema, MeetingChairSeatSchema]);

export const MeetingConveneBodySchema = z.object({
  title: z.string().min(1),
  goal: z.string().optional(),
  session_id: SessionIdSchema.optional(),
  participants: z.array(MeetingRosterSeatSchema).min(1),
  chair: MeetingChairSchema,
});

/** Authoring seat on a `meeting:` flow step. `space` may be a template. */
export const MeetingStepSeatSchema = z
  .object({
    space: z.string().min(1),
    persona: PersonaIdSchema.optional(),
  })
  .strict();

export const MeetingStepChairHumanSchema = z
  .object({
    human: z.literal(true),
  })
  .strict();

export const MeetingStepChairSeatSchema = z
  .object({
    space: z.string().min(1),
    persona: PersonaIdSchema.optional(),
  })
  .strict();

export const MeetingStepChairSchema = z.union([
  MeetingStepChairHumanSchema,
  MeetingStepChairSeatSchema,
]);

/** Optional top-level step facet. Nested `meeting:` is rejected by the nested step schema. */
export const MeetingStepFacetSchema = z
  .object({
    participants: z.array(MeetingStepSeatSchema).min(1),
    chair: MeetingStepChairSchema,
    goal: z.string().optional(),
  })
  .strict();

export const MeetingToParticipantsSchema = z
  .object({
    participant_ids: z.array(ParticipantIdSchema).min(1),
    all: z.never().optional(),
  })
  .strict();

export const MeetingToAllSchema = z
  .object({
    all: z.literal(true),
    participant_ids: z.never().optional(),
  })
  .strict();

export const MeetingToSchema = z.union([MeetingToParticipantsSchema, MeetingToAllSchema]);

export const MeetingSaidDataSchema = z
  .object({
    as_participant_id: ParticipantIdSchema.optional(),
    to: MeetingToSchema,
    text: z.string().optional(),
    in_reply_to: MessageIdSchema.optional(),
    artifacts: z.array(TransferIdSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const hasText = typeof data.text === "string" && data.text.length > 0;
    const hasArtifacts = (data.artifacts?.length ?? 0) > 0;
    if (!hasText && !hasArtifacts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "said requires text or artifacts",
        path: ["text"],
      });
    }
  });

export const MeetingClosedDataSchema = z.object({
  reason: z.string().optional(),
  outcome: z.string().optional(),
  artifacts: z.array(TransferIdSchema).optional(),
  failed: z.boolean().optional(),
});

export const MeetingRosterParticipantSchema = z.object({
  participant_id: ParticipantIdSchema,
  space_id: SpaceIdSchema,
  persona: PersonaIdSchema.optional(),
});

export const MeetingSnapshotChairSchema = z.union([
  z.object({ participant_id: ParticipantIdSchema }),
  z.object({ human: z.literal(true) }),
]);

export const MeetingTranscriptToSchema = z.object({
  all: z.boolean(),
  participant_ids: z.array(ParticipantIdSchema),
});

export const MeetingTranscriptReceiptSchema = z.object({
  participant_id: ParticipantIdSchema,
  status: z.enum(["delivered", "failed"]),
  reason: z.string().optional(),
});

export const MeetingTranscriptMessageSchema = z.object({
  message_id: MessageIdSchema,
  seq: z.number().int().nonnegative(),
  from: MeetingRosterParticipantSchema,
  to: MeetingTranscriptToSchema,
  in_reply_to: MessageIdSchema.optional(),
  text: z.string().optional(),
  artifacts: z.array(TransferIdSchema).optional(),
  receipts: z.array(MeetingTranscriptReceiptSchema),
});

export const MeetingTranscriptSchema = z.object({
  session_id: SessionIdSchema,
  status: z.enum(["open", "closed"]),
  roster: z.array(MeetingRosterParticipantSchema),
  chair: MeetingSnapshotChairSchema,
  since_seq: z.number().int().nonnegative(),
  up_to_seq: z.number().int().nonnegative(),
  messages: z.array(MeetingTranscriptMessageSchema),
});

export type MeetingRosterSeat = z.infer<typeof MeetingRosterSeatSchema>;
export type MeetingChair = z.infer<typeof MeetingChairSchema>;
export type MeetingConveneBody = z.infer<typeof MeetingConveneBodySchema>;
export type MeetingStepSeat = z.infer<typeof MeetingStepSeatSchema>;
export type MeetingStepChair = z.infer<typeof MeetingStepChairSchema>;
export type MeetingStepFacet = z.infer<typeof MeetingStepFacetSchema>;
export type MeetingTo = z.infer<typeof MeetingToSchema>;
export type MeetingSaidData = z.infer<typeof MeetingSaidDataSchema>;
export type MeetingClosedData = z.infer<typeof MeetingClosedDataSchema>;
export type MeetingRosterParticipant = z.infer<typeof MeetingRosterParticipantSchema>;
export type MeetingSnapshotChair = z.infer<typeof MeetingSnapshotChairSchema>;
export type MeetingTranscriptTo = z.infer<typeof MeetingTranscriptToSchema>;
export type MeetingTranscriptReceipt = z.infer<typeof MeetingTranscriptReceiptSchema>;
export type MeetingTranscriptMessage = z.infer<typeof MeetingTranscriptMessageSchema>;
export type MeetingTranscript = z.infer<typeof MeetingTranscriptSchema>;
