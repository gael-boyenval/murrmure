import { z } from "zod";
import { RunIdSchema } from "../ids.js";

export const RunStepStatusSchema = z.enum([
  "pending",
  "working",
  "awaiting_human",
  "completed",
  "failed",
  "skipped",
]);

export const RunStepMemoSchema = z.object({
  run_id: RunIdSchema,
  step_id: z.string(),
  status: RunStepStatusSchema,
  idempotency_key: z.string().optional(),
  result_hash: z.string().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  error_code: z.string().optional(),
  executor_type: z.string().optional(),
});

export type RunStepStatus = z.infer<typeof RunStepStatusSchema>;
export type RunStepMemo = z.infer<typeof RunStepMemoSchema>;
