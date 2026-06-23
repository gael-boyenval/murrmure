import { z } from "zod";
import { EventIdSchema, InstanceIdSchema, SpaceIdSchema, TokenIdSchema } from "../ids.js";
import { StudioDenialSchema } from "../errors/denial.js";

export const HubEventSchema = z.object({
  seq: z.number(),
  space_seq: z.number(),
  instance_seq: z.number().optional(),
  event_id: EventIdSchema,
  type: z.string(),
  outcome: z.enum(["success", "denial"]),
  space_id: SpaceIdSchema,
  instance_id: InstanceIdSchema.optional(),
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
  denial: StudioDenialSchema.optional(),
  federation: z
    .object({
      origin_hub_id: z.string(),
      origin_seq: z.number(),
      ingress: z.boolean(),
    })
    .optional(),
});

export type HubEvent = z.infer<typeof HubEventSchema>;
