import { z } from "zod";
import {
  FlowIdSchema,
  RunIdSchema,
  SessionIdSchema,
  SpaceIdSchema,
} from "../ids.js";
import type { StepArtifactSlot } from "./step-contract.js";

export const RunLifecycleSchema = z.enum([
  "working",
  "input-required",
  "completed",
  "failed",
  "cancelled",
]);

export const ExecContextSchema = z
  .object({
    worktree_path: z.string().optional(),
    branch: z.string().optional(),
    preview_url: z.string().optional(),
  })
  .catchall(z.unknown());

const RunCoreSchema = z.object({
  run_id: RunIdSchema,
  session_id: SessionIdSchema,
  space_id: SpaceIdSchema.optional(),
  flow_id: FlowIdSchema.nullish(),
  flow_digest: z.string().optional(),
  lifecycle: RunLifecycleSchema,
  exec_context: ExecContextSchema.default({}),
  reference_run_ids: z.array(RunIdSchema).default([]),
  started_at: z.string(),
  ended_at: z.string().optional(),
});

/** Accept v1 `instance_id` as alias for `run_id`. */
export const RunSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (record.run_id === undefined && record.instance_id !== undefined) {
    return { ...record, run_id: record.instance_id };
  }
  return value;
}, RunCoreSchema);

export type RunLifecycle = z.infer<typeof RunLifecycleSchema>;
export type ExecContext = z.infer<typeof ExecContextSchema>;
export type Run = z.infer<typeof RunSchema>;

/**
 * Sanitized resolver descriptor projected on an open step. Server-derived from
 * the canonical handler match and authorized for the caller. Carries no
 * command, prompt, path, parameter, environment, or secret. `view_id` is
 * present only for `view_resolver`.
 */
export interface OpenStepResolver {
  handler_id: string;
  type: string;
  view_id?: string;
}

/**
 * Inline View reference for a `view_resolver` open step. The shell loads the
 * locally built View from this without client-side handler matching. `entry` is
 * the View manifest entry path (e.g. `./dist/index.html`), not a host path.
 */
export interface OpenStepViewRef {
  view_id: string;
  origin_space_id: string;
  entry?: string;
  shell_route?: string;
}

/**
 * Projection of one open step and its bound resolver. `resolver: null` means
 * no space handler is bound; an authorized protocol client must resolve the
 * step externally. The shell must not synthesize a form or fallback control.
 * `view` is present only when a `view_resolver` is bound.
 */
export interface OpenStepResolverProjection {
  step_id: string;
  parent_id?: string | null;
  description?: string;
  resolver: OpenStepResolver | null;
  view?: OpenStepViewRef | null;
  branches: Array<{
    branch: string;
    schema_ref?: string;
    schema?: Record<string, unknown>;
    payload_required: string[];
    artifact_required: string[];
    artifact_slots: Record<string, StepArtifactSlot>;
  }>;
}
