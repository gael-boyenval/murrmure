import { z } from "zod";
import { GateIdSchema, RunIdSchema, SessionIdSchema } from "../ids.js";

export const GateStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);

export const GateFormFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  values: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const GateFormSchema = z.object({
  id: z.string(),
  fields: z.array(GateFormFieldSchema),
});

export const GateSchema = z.object({
  gate_id: GateIdSchema,
  run_id: RunIdSchema,
  session_id: SessionIdSchema,
  step_id: z.string(),
  status: GateStatusSchema,
  assignees: z.array(z.string()).optional(),
  resolve_mode: z.literal("any_one").default("any_one"),
  expires_at: z.string().optional(),
  form: GateFormSchema.optional(),
  payload_ref: z.string().optional(),
});

export type GateStatus = z.infer<typeof GateStatusSchema>;
export type GateFormField = z.infer<typeof GateFormFieldSchema>;
export type GateForm = z.infer<typeof GateFormSchema>;
export type Gate = z.infer<typeof GateSchema>;
