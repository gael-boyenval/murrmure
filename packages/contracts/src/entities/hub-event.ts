import { z } from "zod";
import {
  EventIdSchema,
  InstanceIdSchema,
  RunIdSchema,
  SpaceIdSchema,
  TokenIdSchema,
  instanceIdToRunId,
} from "../ids.js";
import { MurrmureDenialSchema } from "../errors/denial.js";
import {
  JournalEntrySchema,
  buildJournalSubjectPath,
  type JournalEntry,
} from "../journal/cloudevents.js";

export const HubEventSchema = z.object({
  seq: z.number(),
  space_seq: z.number(),
  instance_seq: z.number().optional(),
  event_id: EventIdSchema,
  type: z.string(),
  outcome: z.enum(["success", "denial"]),
  space_id: SpaceIdSchema,
  instance_id: InstanceIdSchema.optional(),
  run_id: RunIdSchema.optional(),
  session_id: z.string().optional(),
  actor_id: z.string(),
  token_id: TokenIdSchema,
  harness: z.string().optional(),
  ts: z.string(),
  payload: z.record(z.unknown()),
  blob_refs: z.array(
    z.object({
      blob_id: z.string(),
      digest: z.string(),
      media_type: z.string(),
    }),
  ),
  dedup_key: z.string().optional(),
  denial: MurrmureDenialSchema.optional(),
  federation: z
    .object({
      origin_hub_id: z.string(),
      origin_seq: z.number(),
      ingress: z.boolean(),
    })
    .optional(),
});

export type HubEvent = z.infer<typeof HubEventSchema>;

/**
 * @deprecated Prefer JournalEntrySchema — v1 hub events map to CloudEvents journal entries.
 */
export function hubEventToJournalEntry(
  event: HubEvent,
  options?: { hub_id?: string; session_id?: string },
): JournalEntry {
  const runId =
    event.run_id ??
    (event.instance_id !== undefined ? instanceIdToRunId(event.instance_id) : undefined);
  const sessionId = options?.session_id ?? event.session_id;
  const source = options?.hub_id ? `/hubs/${options.hub_id}` : `/spaces/${event.space_id}`;

  return JournalEntrySchema.parse({
    specversion: "1.0",
    id: event.event_id,
    source,
    type: event.type,
    subject: sessionId !== undefined ? buildJournalSubjectPath(sessionId, runId) : undefined,
    time: event.ts,
    datacontenttype: "application/json",
    data: {
      outcome: event.outcome,
      payload: event.payload,
      blob_refs: event.blob_refs,
      denial: event.denial,
      federation: event.federation,
      token_id: event.token_id,
      harness: event.harness,
    },
    seq: event.seq,
    space_id: event.space_id,
    session_id: sessionId,
    run_id: runId,
    dedup_key: event.dedup_key,
    actor_id: event.actor_id,
  });
}

