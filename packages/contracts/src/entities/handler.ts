import { z } from "zod";

/**
 * Resolver-agnostic handler binding (v3).
 *
 * A space binds resolver implementations — View, agent, shell, or script — to
 * modality-agnostic flow steps in `handlers.yaml`. The portable flow carries no
 * View identity; the binding lives here.
 *
 * Canonical step binding is `on: step.opened::{flow_name}.{qualified_step_id}`
 * (or `step.resolved::...` for reactions). The readable alias is resolved to
 * immutable `{ origin_space_id, flow_id, flow_digest, qualified_step_id }` at
 * apply time. Lifecycle-only `on: step.opened` plus dispatch through
 * `contract_keys` is removed and rejected by strict-schema validation.
 * `contract_keys` survives as prompt scope only (subgraph-owner handlers).
 *
 * `view_resolver` requires `view: <view-id>` and forbids command/executor
 * fields. Authored `kill_on` is absent; assignment termination is runtime-owned.
 * See `studio-specs/current/bridges/handlers.md`.
 */

/** Step lifecycle binding with a readable `{flow_name}.{qualified_step_id}` alias. */
export const HandlerOnStepSchema = z
  .string()
  .regex(
    /^step\.(opened|resolved)::.+$/,
    "on must be step.opened::{flow_name}.{qualified_step_id}, step.resolved::{flow_name}.{qualified_step_id}, or an event object",
  );

export const HandlerEventFilterSchema = z.object({
  type: z.string(),
  source: z.union([z.string(), z.array(z.string())]).optional(),
});

export const HandlerOnEventSchema = z.object({
  event: HandlerEventFilterSchema,
});

export const HandlerOnSchema = z.union([HandlerOnStepSchema, HandlerOnEventSchema]);

export const HandlerTypeSchema = z.enum([
  "shell_spawn",
  "mcp_session",
  "queue_poll",
  "remote_hub",
  "view_resolver",
]);

export const HandlerCompleteSchema = z.enum(["auto", "cli", "explicit"]);

/** Fields shared by every handler. `contract_keys` is prompt scope only. */
const HandlerCommonFields = {
  id: z.string().min(1),
  contract_keys: z.array(z.string()).default([]),
  on: HandlerOnSchema,
};

/** Executor handler (shell/agent/script). Carries command + completion policy. */
const ExecutorHandlerSpecSchema = z
  .object({
    ...HandlerCommonFields,
    type: z.enum(["shell_spawn", "mcp_session", "queue_poll", "remote_hub"]),
    complete: HandlerCompleteSchema.default("explicit"),
    prompt: z.string().optional(),
    command: z.string().optional(),
    cwd: z.string().optional(),
    timeout_ms: z.number().int().positive().optional(),
    delivery: z.enum(["fail_fast", "queue_until_executor"]).optional(),
    params: z.record(z.unknown()).optional(),
  })
  .strict();

/** View resolver binding. Requires `view`; forbids command/executor fields. */
const ViewResolverHandlerSpecSchema = z
  .object({
    ...HandlerCommonFields,
    type: z.literal("view_resolver"),
    view: z.string().min(1),
  })
  .strict();

export const HandlerSpecSchema = z.discriminatedUnion("type", [
  ViewResolverHandlerSpecSchema,
  ExecutorHandlerSpecSchema,
]);

/**
 * Authored run policy — per-flow run capacity declared in `handlers.yaml`.
 *
 * `flow` is a readable alias (the applied flow's `name`) resolved during apply
 * to canonical `{ origin_space_id, flow_id, flow_digest }`. No policy means a
 * flow is unlimited. The portable flow manifest carries no concurrency policy;
 * capacity is space-owned, like handler bindings.
 */
export const RunPolicySchema = z
  .object({
    flow: z.string().min(1),
    max_concurrent_runs: z.number().int().min(1),
  })
  .strict();

/**
 * `handlers.yaml`. The file object is intentionally permissive at the top level
 * so YAML anchors/aliases (`x-*`) used for prompt reuse are not rejected; each
 * handler is strict, so authored `kill_on` and unknown executor fields are
 * rejected. `run_policies` carries space-owned per-flow run capacity; each
 * policy is strict. Alias resolution and capacity validation happen at apply.
 */
export const HandlersFileSchema = z.object({
  version: z.literal(1),
  run_policies: z.array(RunPolicySchema).default([]),
  handlers: z.array(HandlerSpecSchema),
});

export type HandlerEventFilter = z.infer<typeof HandlerEventFilterSchema>;
export type HandlerOn = z.infer<typeof HandlerOnSchema>;
export type HandlerType = z.infer<typeof HandlerTypeSchema>;
export type HandlerComplete = z.infer<typeof HandlerCompleteSchema>;
export type HandlerSpec = z.infer<typeof HandlerSpecSchema>;
export type HandlersFile = z.infer<typeof HandlersFileSchema>;
export type RunPolicy = z.infer<typeof RunPolicySchema>;

/**
 * Canonical run policy persisted in the space index after alias resolution.
 * `flow` keeps the authored readable alias for operator display; the canonical
 * identity (`origin_space_id`, `flow_id`, `flow_digest`) is what admission and
 * audit use. A flow digest change invalidates a stale policy on the next apply.
 */
export const ResolvedRunPolicySchema = z.object({
  flow: z.string(),
  max_concurrent_runs: z.number().int().min(1),
  origin_space_id: z.string(),
  flow_id: z.string(),
  flow_digest: z.string(),
});

export type ResolvedRunPolicy = z.infer<typeof ResolvedRunPolicySchema>;

/** A parsed `step.(opened|resolved)::{alias}` binding. */
export interface HandlerStepBinding {
  lifecycle: "opened" | "resolved";
  /** Readable `{flow_name}.{qualified_step_id}` alias; resolved to canonical identity at apply. */
  alias: string;
}

/** Extract the step lifecycle + alias from an `on` value, or `null` for event handlers. */
export function parseHandlerStepBinding(on: HandlerOn): HandlerStepBinding | null {
  if (typeof on !== "string") return null;
  const match = on.match(/^step\.(opened|resolved)::(.+)$/);
  if (!match) return null;
  return { lifecycle: match[1] as "opened" | "resolved", alias: match[2]! };
}
