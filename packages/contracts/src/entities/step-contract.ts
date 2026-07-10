import { z } from "zod";
import { FlowViewRefSchema } from "../flow/view-ref.js";

/** Normative step statuses (v2.2 § Step identity/status). */
export const StepStatusSchema = z.enum([
  "pending",
  "working",
  "awaiting_human",
  "completed",
  "failed",
  "skipped",
]);

export type StepStatus = z.infer<typeof StepStatusSchema>;

export const StepOrchestrationSchema = z.enum(["engine-routed", "agent-scheduled"]);

export type StepOrchestration = z.infer<typeof StepOrchestrationSchema>;

export const StepRoleSchema = z.enum(["agent", "human", "system"]);

export type StepRole = z.infer<typeof StepRoleSchema>;

/** Inline JSON Schema object or registry ref string. */
export const StepBranchSchemaValueSchema = z.union([z.record(z.unknown()), z.string()]);

export const StepArtifactSlotSchema = z.object({
  description: z.string().optional(),
  max_bytes: z.number().int().positive().optional(),
});

export type StepArtifactSlot = z.infer<typeof StepArtifactSlotSchema>;

/** Authoring branch definition (manifest YAML). */
export const StepBranchDefinitionSchema = z.object({
  schema: StepBranchSchemaValueSchema.optional(),
  schema_ref: z.string().optional(),
  next: z.string().nullable().optional(),
  fail_run: z.boolean().optional(),
  complete: z.union([z.literal("parent"), z.literal(true)]).optional(),
  continue: z.union([z.literal("parent"), z.literal(true)]).optional(),
  goto: z.string().optional(),
  fail: z.boolean().optional(),
  artifact_slots: z.record(StepArtifactSlotSchema).optional(),
});

export type StepBranchDefinition = z.infer<typeof StepBranchDefinitionSchema>;

export const StepPresentationSchema = z.object({
  view: z.string(),
  view_ref: FlowViewRefSchema.optional(),
  assignees: z.array(z.string()).optional(),
  expires_at: z.string().optional(),
});

export type StepPresentation = z.infer<typeof StepPresentationSchema>;

export type StepContractManifestStep = {
  id: string;
  description?: string;
  role?: StepRole;
  orchestration?: StepOrchestration;
  presentation?: StepPresentation;
  branches: Record<string, StepBranchDefinition>;
  steps?: StepContractManifestStep[];
};

export const StepContractManifestStepSchema: z.ZodType<StepContractManifestStep> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    description: z.string().optional(),
    role: StepRoleSchema.optional(),
    orchestration: StepOrchestrationSchema.optional(),
    presentation: StepPresentationSchema.optional(),
    branches: z.record(StepBranchDefinitionSchema),
    steps: z.array(StepContractManifestStepSchema).optional(),
  }),
);

/** Compiled route effect (catalog entry). */
export const StepCatalogRouteSchema = z.object({
  engine: z
    .enum(["open", "advance", "fail_run", "complete_parent", "continue_parent", "goto"])
    .optional(),
  step_id: z.string().optional(),
  fail_run: z.boolean().optional(),
});

export type StepCatalogRoute = z.infer<typeof StepCatalogRouteSchema>;

export const StepCatalogBranchSchema = z.object({
  schema_ref: z.string().optional(),
  schema: z.record(z.unknown()).optional(),
  routes: z.array(StepCatalogRouteSchema).min(1),
});

export type StepCatalogBranch = z.infer<typeof StepCatalogBranchSchema>;

export const StepContractCatalogEntrySchema = z.object({
  step_id: z.string(),
  parent_id: z.string().nullable(),
  description: z.string().optional(),
  role: StepRoleSchema,
  branches: z.record(StepCatalogBranchSchema),
  artifact_slots: z.record(StepArtifactSlotSchema).optional(),
  presentation: StepPresentationSchema.optional(),
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
  then: z.string(),
});

export type StepContractSliceBranch = z.infer<typeof StepContractSliceBranchSchema>;

/** Runtime scoped slice (populated at run in VS-5). */
export const StepContractSliceSchema = z.object({
  step_id: z.string(),
  parent_id: z.string().nullable().optional(),
  description: z.string().optional(),
  role: StepRoleSchema,
  branches: z.record(StepContractSliceBranchSchema),
  workdir: z.string().optional(),
  iteration: z.number().int().nonnegative().optional(),
  inputs_from_run: z.record(z.unknown()).optional(),
});

export type StepContractSlice = z.infer<typeof StepContractSliceSchema>;

export const ListStepContractsResponseSchema = z.object({
  run_id: z.string(),
  orchestration: StepOrchestrationSchema.optional(),
  active: StepContractSliceSchema.nullable(),
  callable: z.array(StepContractSliceSchema),
  graph_digest: z.string(),
});

export type ListStepContractsResponse = z.infer<typeof ListStepContractsResponseSchema>;
