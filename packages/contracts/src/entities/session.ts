import { z } from "zod";
import { SessionIdSchema, SpaceIdSchema } from "../ids.js";

export const SessionStatusSchema = z.enum([
  "active",
  "completed",
  "partial_failure",
  "failed",
  "cancelled",
]);

export const SessionCreatedBySchema = z.union([
  z.object({ type: z.literal("actor"), actor_id: z.string() }),
  z.object({ type: z.literal("hook"), hook_id: z.string() }),
  z.object({ type: z.literal("flow"), flow_id: z.string() }),
]);

export const SessionSchema = z.object({
  session_id: SessionIdSchema,
  subject: z.string().optional(),
  title: z.string(),
  status: SessionStatusSchema,
  created_by: SessionCreatedBySchema,
  spaces_touched: z.array(SpaceIdSchema),
});

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type SessionCreatedBy = z.infer<typeof SessionCreatedBySchema>;
export type Session = z.infer<typeof SessionSchema>;
