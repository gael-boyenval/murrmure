import { z } from "zod";

export const HandlerLifecycleOnSchema = z.union([
  z.literal("step.opened"),
  z.literal("step.resolved"),
]);

export const HandlerEventFilterSchema = z.object({
  type: z.string(),
  source: z.union([z.string(), z.array(z.string())]).optional(),
});

export const HandlerOnSchema = z.union([
  HandlerLifecycleOnSchema,
  z.object({
    event: HandlerEventFilterSchema,
  }),
]);

export const HandlerTypeSchema = z.enum([
  "shell_spawn",
  "mcp_session",
  "queue_poll",
  "remote_hub",
]);

export const HandlerCompleteSchema = z.enum(["auto", "cli", "explicit"]);

export const HandlerSpecSchema = z.object({
  id: z.string().min(1),
  contract_keys: z.array(z.string()).default([]),
  on: HandlerOnSchema,
  kill_on: HandlerOnSchema.optional(),
  type: HandlerTypeSchema,
  complete: HandlerCompleteSchema.default("explicit"),
  prompt: z.string().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
  delivery: z.enum(["fail_fast", "queue_until_executor"]).optional(),
  params: z.record(z.unknown()).optional(),
});

export const HandlersFileSchema = z.object({
  version: z.literal(1),
  handlers: z.array(HandlerSpecSchema),
});

export type HandlerLifecycleOn = z.infer<typeof HandlerLifecycleOnSchema>;
export type HandlerEventFilter = z.infer<typeof HandlerEventFilterSchema>;
export type HandlerOn = z.infer<typeof HandlerOnSchema>;
export type HandlerType = z.infer<typeof HandlerTypeSchema>;
export type HandlerComplete = z.infer<typeof HandlerCompleteSchema>;
export type HandlerSpec = z.infer<typeof HandlerSpecSchema>;
export type HandlersFile = z.infer<typeof HandlersFileSchema>;
