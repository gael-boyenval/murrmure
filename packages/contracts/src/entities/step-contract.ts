import { z } from "zod";

/**
 * Resolver-agnostic step contracts (v3).
 *
 * A step is a contract plus open/resolve events, branches, and routes. It
 * carries no `role`, `presentation`, `deriveRole`, wait kind, or resolver
 * modality — spaces bind resolvers through handlers. See
 * `studio-specs/current/bridges/step-contract.md`.
 */

/** Inline JSON Schema object or registry ref string. */
export const StepBranchSchemaValueSchema = z.union([z.record(z.unknown()), z.string()]);

/** Branch route: open/transfer to a step, or terminate the run. */
export const StepBranchRouteSchema = z.object({
  step: z.string().optional(),
  run: z.enum(["completed", "failed"]).optional(),
});

export type StepBranchRoute = z.infer<typeof StepBranchRouteSchema>;

/**
 * Artifact slot declaration. Enrichment fields (`media_types`, `extensions`,
 * `min_bytes`, `max_files`, …) are part of the authoring contract; enforcement
 * is owned by the artifact-validation slice.
 */
export const StepArtifactSlotSchema = z.object({
  description: z.string().optional(),
  media_types: z.array(z.string().transform((value) => value.toLowerCase())).optional(),
  extensions: z.array(z.string().transform((value) => {
    const normalized = value.toLowerCase();
    return normalized.startsWith(".") ? normalized : `.${normalized}`;
  })).optional(),
  min_bytes: z.number().int().nonnegative().optional(),
  max_bytes: z.number().int().positive().optional(),
  min_files: z.number().int().nonnegative().optional(),
  max_files: z.number().int().positive().optional(),
  max_total_bytes: z.number().int().positive().optional(),
}).superRefine((slot, ctx) => {
  if (slot.max_bytes !== undefined && slot.min_bytes !== undefined && slot.min_bytes > slot.max_bytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min_bytes must not exceed max_bytes" });
  }
  if (slot.max_files !== undefined && slot.min_files !== undefined && slot.min_files > slot.max_files) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min_files must not exceed max_files" });
  }
});

export type StepArtifactSlot = z.infer<typeof StepArtifactSlotSchema>;

/**
 * Authoring branch definition (manifest YAML). Flat shape: `schema`,
 * `artifact_slots`, and optional `route` / `resume` are sibling fields.
 * Wrapper shapes (`payload`, `outcome`) and superseded routing keys
 * (`next`, `fail_run`, `complete`, `continue`, `goto`, `fail`) are rejected by
 * the parser — there is no dual parser.
 */
export const StepBranchDefinitionSchema = z.object({
  schema: StepBranchSchemaValueSchema.optional(),
  schema_ref: z.string().optional(),
  artifact_slots: z.record(StepArtifactSlotSchema).optional(),
  route: StepBranchRouteSchema.optional(),
  resume: z.string().optional(),
}).strict().superRefine((branch, ctx) => {
  if (!branch.artifact_slots || !branch.schema || typeof branch.schema !== "object") return;
  const properties =
    branch.schema.properties &&
    typeof branch.schema.properties === "object" &&
    !Array.isArray(branch.schema.properties)
      ? (branch.schema.properties as Record<string, unknown>)
      : {};
  for (const slot of Object.keys(branch.artifact_slots)) {
    if (Object.hasOwn(properties, slot)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifact_slots", slot],
        message: `Payload property and artifact slot '${slot}' collide`,
      });
    }
  }
});

export type StepBranchDefinition = z.infer<typeof StepBranchDefinitionSchema>;

/**
 * Branch map authoring field. Explicit `branches: {}` is invalid — omit
 * `branches` to receive `completed` / `failed` defaults or declare at least one
 * branch. The parser hard-rejects an empty map (`EMPTY_BRANCHES`); the schema
 * refine keeps direct `FlowManifestSchema` parses honest too.
 */
export const StepBranchMapSchema = z
  .record(StepBranchDefinitionSchema)
  .refine((map) => Object.keys(map).length > 0, {
    message:
      "branches: {} is invalid — omit branches to receive defaults or declare at least one branch",
  });

export type StepContractManifestStep = {
  id: string;
  description?: string;
  branches?: Record<string, StepBranchDefinition>;
  steps?: StepContractManifestStep[];
};

export const StepContractManifestStepSchema: z.ZodType<StepContractManifestStep> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    description: z.string().optional(),
    branches: StepBranchMapSchema.optional(),
    steps: z.array(StepContractManifestStepSchema).optional(),
  }).strict(),
);

/** Compiled route effect (catalog entry). */
export const StepCatalogRouteSchema = z.object({
  engine: z.enum(["open", "advance", "fail_run", "resume"]).optional(),
  step_id: z.string().optional(),
});

export type StepCatalogRoute = z.infer<typeof StepCatalogRouteSchema>;

export const StepCatalogBranchSchema = z.object({
  schema_ref: z.string().optional(),
  schema: z.record(z.unknown()).optional(),
  payload_required: z.array(z.string()),
  artifact_required: z.array(z.string()),
  artifact_slots: z.record(StepArtifactSlotSchema),
  routes: z.array(StepCatalogRouteSchema).min(1),
});

export type StepCatalogBranch = z.infer<typeof StepCatalogBranchSchema>;

/**
 * One canonical branch resolve contract per branch. Owned here so every
 * compiler, runtime, and consumer projection references a single definition.
 */
export interface BranchResolveContract {
  step_id: string;
  branch: string;
  schema_ref?: string;
  schema?: Record<string, unknown>;
  payload_required: string[];
  artifact_required: string[];
  artifact_slots: Record<string, StepArtifactSlot>;
  routes: StepCatalogRoute[];
}

export const StepContractCatalogEntrySchema = z.object({
  step_id: z.string(),
  parent_id: z.string().nullable(),
  description: z.string().optional(),
  branches: z.record(StepCatalogBranchSchema),
});

export type StepContractCatalogEntry = z.infer<typeof StepContractCatalogEntrySchema>;

export const StepContractCatalogSchema = z.object({
  flow_id: z.string(),
  digest: z.string(),
  graph_digest: z.string(),
  entries: z.array(StepContractCatalogEntrySchema),
  step_ids: z.array(z.string()),
});

export type StepContractCatalog = z.infer<typeof StepContractCatalogSchema>;

/** Runtime branch slice with human-readable route hint. */
export const StepContractSliceBranchSchema = z.object({
  schema_ref: z.string().optional(),
  schema: z.record(z.unknown()).optional(),
  payload_required: z.array(z.string()),
  artifact_required: z.array(z.string()),
  artifact_slots: z.record(StepArtifactSlotSchema),
  then: z.string(),
});

export type StepContractSliceBranch = z.infer<typeof StepContractSliceBranchSchema>;

/** Runtime scoped slice (populated at run). */
export const StepContractSliceSchema = z.object({
  step_id: z.string(),
  parent_id: z.string().nullable().optional(),
  description: z.string().optional(),
  branches: z.record(StepContractSliceBranchSchema),
  workdir: z.string().optional(),
  iteration: z.number().int().nonnegative().optional(),
  inputs_from_run: z.record(z.unknown()).optional(),
});

export type StepContractSlice = z.infer<typeof StepContractSliceSchema>;

export const ListStepContractsResponseSchema = z.object({
  run_id: z.string(),
  active: StepContractSliceSchema.nullable(),
  callable: z.array(StepContractSliceSchema),
  graph_digest: z.string(),
});

export type ListStepContractsResponse = z.infer<typeof ListStepContractsResponseSchema>;
