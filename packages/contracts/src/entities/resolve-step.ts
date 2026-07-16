import { z } from "zod";

export const ResolveStepArtifactOutSchema = z.object({
  slot: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1).optional(),
  media_type: z.string().min(1).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

export type ResolveStepArtifactOut = z.infer<typeof ResolveStepArtifactOutSchema>;

/** Body for POST /v1/runs/{run_id}/steps/{step_id}/resolve (v2.2 § Unified step API). */
export const ResolveStepBodySchema = z.object({
  branch: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  artifacts_out: z.array(ResolveStepArtifactOutSchema).optional(),
  upload_intent_id: z.string().min(1).optional(),
  idempotency_key: z.string().optional(),
});

export type ResolveStepBody = z.infer<typeof ResolveStepBodySchema>;
