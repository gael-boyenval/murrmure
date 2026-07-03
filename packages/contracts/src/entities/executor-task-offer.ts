import { z } from "zod";
import { RunIdSchema } from "../ids.js";

/** rev-1 §4.6 — task offer delivered to external queue_poll workers. */
export const ExecutorTaskOfferSchema = z.object({
  task_id: z.string(),
  run_id: RunIdSchema,
  step_id: z.string(),
  action_name: z.string(),
  space_id: z.string(),
  params: z.record(z.unknown()),
  artifacts_in: z.array(z.string()).optional(),
  deadline_at: z.string(),
});

export type ExecutorTaskOffer = z.infer<typeof ExecutorTaskOfferSchema>;

export const ExecutorTaskCompleteBodySchema = z.object({
  result: z.record(z.unknown()).optional(),
});

export const ExecutorTaskFailBodySchema = z.object({
  error_code: z.string().optional(),
  detail: z.string().optional(),
});
