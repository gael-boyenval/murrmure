import { z } from "zod";

export const McpSessionBindingSchema = z.object({
  type: z.literal("mcp_session"),
  executor_id: z.string(),
  required_scopes: z.array(z.string()).optional(),
});

export const ShellSpawnBindingSchema = z.object({
  type: z.literal("shell_spawn"),
  executor_id: z.string(),
});

export const QueuePollBindingSchema = z.object({
  type: z.literal("queue_poll"),
  executor_id: z.string(),
  poll_interval_ms: z.number().int().positive().optional(),
});

export const RemoteHubBindingSchema = z.object({
  type: z.literal("remote_hub"),
  executor_id: z.string(),
  remote_hub_id: z.string(),
  remote_space_id: z.string().optional(),
});

export const A2aBindingSchema = z.object({
  type: z.literal("a2a"),
  executor_id: z.string(),
  endpoint: z.string().url(),
});

export const ExecutorBindingSchema = z.discriminatedUnion("type", [
  McpSessionBindingSchema,
  ShellSpawnBindingSchema,
  QueuePollBindingSchema,
  RemoteHubBindingSchema,
  A2aBindingSchema,
]);

export const ExecutorEntrySchema = z.object({
  binding: ExecutorBindingSchema,
});

export const ExecutorsFileSchema = z.object({
  executors: z.record(ExecutorEntrySchema),
});

export type McpSessionBinding = z.infer<typeof McpSessionBindingSchema>;
export type ShellSpawnBinding = z.infer<typeof ShellSpawnBindingSchema>;
export type QueuePollBinding = z.infer<typeof QueuePollBindingSchema>;
export type RemoteHubBinding = z.infer<typeof RemoteHubBindingSchema>;
export type A2aBinding = z.infer<typeof A2aBindingSchema>;
export type ExecutorBinding = z.infer<typeof ExecutorBindingSchema>;
export type ExecutorEntry = z.infer<typeof ExecutorEntrySchema>;
export type ExecutorsFile = z.infer<typeof ExecutorsFileSchema>;
