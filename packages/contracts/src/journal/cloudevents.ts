import { z } from "zod";
import { RunIdSchema, SessionIdSchema, SpaceIdSchema, TransferIdSchema } from "../ids.js";

export const JournalDataRefSchema = z.object({
  transfer_id: TransferIdSchema,
  digest: z.string(),
});

export const JournalEntrySchema = z.object({
  specversion: z.literal("1.0"),
  id: z.string(),
  source: z.string(),
  type: z.string(),
  subject: z.string().optional(),
  time: z.string(),
  datacontenttype: z.literal("application/json").optional(),
  data: z.record(z.unknown()).optional(),
  dataref: JournalDataRefSchema.optional(),
  seq: z.number().int().nonnegative(),
  space_id: SpaceIdSchema,
  session_id: SessionIdSchema.optional(),
  run_id: RunIdSchema.optional(),
  dedup_key: z.string().optional(),
  actor_id: z.string().optional(),
});

export type JournalDataRef = z.infer<typeof JournalDataRefSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/** Derive CloudEvents subject from Murrmure correlation ids (rev-1 §8.1). */
export function deriveJournalSubject(input: {
  session_id?: string;
  run_id?: string;
}): string | undefined {
  if (input.session_id && input.run_id) {
    return `sessions/${input.session_id}/runs/${input.run_id}`;
  }
  if (input.session_id) {
    return `sessions/${input.session_id}`;
  }
  return undefined;
}

export function buildJournalSubjectPath(sessionId: string, runId?: string): string {
  return runId ? `sessions/${sessionId}/runs/${runId}` : `sessions/${sessionId}`;
}
