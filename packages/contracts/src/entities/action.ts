import { z } from "zod";
import { SpaceIdSchema } from "../ids.js";

export const ActionIdempotencySchema = z.enum(["caller_key", "none"]);

/** Hub-indexed action registry row (from `murrmure/actions.yaml`). */
export const IndexedActionSchema = z.object({
  name: z.string(),
  space_id: SpaceIdSchema,
  executor: z.string(),
  timeout_ms: z.number().int().positive().optional(),
  response_schema: z.string().optional(),
  idempotency: ActionIdempotencySchema.optional(),
  command: z.string().optional(),
  /** Multiline template for agent/shell prompts; supports `{{param}}` from invoke params. */
  prompt: z.string().optional(),
  cwd: z.string().optional(),
  delivery: z.enum(["fail_fast", "queue_until_executor"]).optional(),
});

export const ActionsFileSchema = z.object({
  version: z.literal(1),
  actions: z.record(IndexedActionSchema.omit({ name: true, space_id: true })),
});

export type IndexedAction = z.infer<typeof IndexedActionSchema>;
export type ActionsFile = z.infer<typeof ActionsFileSchema>;
