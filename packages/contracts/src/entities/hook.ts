import { z } from "zod";
import { FlowIdSchema } from "../ids.js";

export const HookEventFilterSchema = z.object({
  type: z.string(),
  source: z.union([z.string(), z.array(z.string())]).optional(),
});

export const HookOnSchema = z.object({
  event: HookEventFilterSchema,
});

export const HookEnsureSessionSchema = z.object({
  ensure_session: z.object({
    title: z.string(),
    subject: z.string().optional(),
  }),
});

export const HookInvokeSchema = z.object({
  invoke: z.object({
    action: z.string(),
    params: z.record(z.unknown()).optional(),
    space: z.string().optional(),
  }),
});

export const HookStartFlowSchema = z.object({
  start_flow: z.object({
    flow_id: FlowIdSchema,
    input: z.record(z.unknown()).optional(),
  }),
});

export const HookActionSchema = z.union([
  HookEnsureSessionSchema,
  HookInvokeSchema,
  HookStartFlowSchema,
]);

export const HookSpecSchema = z.object({
  on: HookOnSchema,
  do: z.array(HookActionSchema).min(1),
});

export const HooksFileSchema = z.object({
  version: z.literal(1),
  hooks: z.record(HookSpecSchema),
});

export type HookEventFilter = z.infer<typeof HookEventFilterSchema>;
export type HookSpec = z.infer<typeof HookSpecSchema>;
export type HooksFile = z.infer<typeof HooksFileSchema>;
