import { z } from "zod";
import { InstanceIdSchema, SpaceIdSchema } from "../ids.js";
import { WaitConditionSchema } from "../wait-condition.js";

export const SpaceGetQuerySchema = z.object({
  kind: z.literal("space.get"),
  space_id: SpaceIdSchema,
});

export const InstanceGetQuerySchema = z.object({
  kind: z.literal("instance.get"),
  space_id: SpaceIdSchema,
  instance_id: InstanceIdSchema,
});

export const InstanceListQuerySchema = z.object({
  kind: z.literal("instance.list"),
  space_id: SpaceIdSchema,
});

export const StateGetQuerySchema = z.object({
  kind: z.literal("state.get"),
  space_id: SpaceIdSchema,
  instance_id: InstanceIdSchema,
});

export const GateListQuerySchema = z.object({
  kind: z.literal("gate.list"),
  space_id: SpaceIdSchema,
  instance_id: InstanceIdSchema.optional(),
});

export const EventTailQuerySchema = z.object({
  kind: z.literal("event.tail"),
  space_id: SpaceIdSchema,
  from_seq: z.number().default(0),
  limit: z.number().optional(),
});

export const WaitPollQuerySchema = z.object({
  kind: z.literal("wait.poll"),
  space_id: SpaceIdSchema,
  wait_id: z.string(),
});

export const AuthWhoamiQuerySchema = z.object({
  kind: z.literal("auth.whoami"),
  space_id: SpaceIdSchema,
});

export const GrantListQuerySchema = z.object({
  kind: z.literal("grant.list"),
  space_id: SpaceIdSchema,
});

export const AuditExportQuerySchema = z.object({
  kind: z.literal("audit.export"),
  space_id: SpaceIdSchema,
  from_seq: z.number().default(0),
  limit: z.number().optional(),
  filter: z
    .object({
      instance_id: InstanceIdSchema.optional(),
      event_type: z.string().optional(),
    })
    .optional(),
});

export const WaitPollResultSchema = z.object({
  status: z.enum(["pending", "matched", "denied", "timed_out", "cancelled"]),
  wait_id: z.string(),
  condition: WaitConditionSchema.optional(),
  entry: z.record(z.unknown()).optional(),
});

export type WaitPollResult = z.infer<typeof WaitPollResultSchema>;
