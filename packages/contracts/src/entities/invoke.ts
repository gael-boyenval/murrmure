import { z } from "zod";
import { RunIdSchema, SessionIdSchema } from "../ids.js";

export const InvokeDeliverySchema = z.enum(["fail_fast", "queue_until_executor"]);

export const InvokeBodySchema = z.object({
  session_id: SessionIdSchema.optional(),
  run_id: RunIdSchema.optional(),
  step_id: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  expect: z
    .object({
      response_schema: z.string().optional(),
    })
    .optional(),
  artifacts_in: z.array(z.string()).optional(),
  delivery: InvokeDeliverySchema.optional(),
});

export type InvokeBody = z.infer<typeof InvokeBodySchema>;
