import { z } from "zod";
import { FlowIdSchema } from "../ids.js";
import { FlowStartConditionsSchema, FlowCheckpointOnResolveSchema } from "./manifest.js";
import { FlowViewRefSchema } from "./view-ref.js";

export const FlowStepKindSchema = z.enum(["invoke", "gate", "wait", "parallel", "start_flow", "step_contract"]);

export const FlowStepIrStartFlowSchema = z.object({
  flow_id: z.string(),
  input: z.record(z.unknown()).optional(),
  wait: z.boolean().optional(),
  continue_on_error: z.boolean().optional(),
});

export const FlowStepIrInvokeSchema = z.object({
  space: z.string(),
  action: z.string(),
  params: z.record(z.unknown()).optional(),
  artifacts_in: z.array(z.string()).optional(),
});

export const FlowStepIrGateSchema = z.object({
  form: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  view_id: z.string().optional(),
  view_ref: FlowViewRefSchema.optional(),
  merge_input: z.boolean().optional(),
  payload_ref: z.string().optional(),
  on_resolve: FlowCheckpointOnResolveSchema.optional(),
});

export const FlowStepIrParallelSchema = z.object({
  matrix: z.string(),
  lane: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["invoke", "gate"]),
      invoke: FlowStepIrInvokeSchema.optional(),
      gate: FlowStepIrGateSchema.optional(),
    }),
  ),
});

export const FlowStepIrSchema = z.object({
  id: z.string(),
  kind: FlowStepKindSchema,
  invoke: FlowStepIrInvokeSchema.optional(),
  gate: FlowStepIrGateSchema.optional(),
  parallel: FlowStepIrParallelSchema.optional(),
  start_flow: FlowStepIrStartFlowSchema.optional(),
  step_contract: z
    .object({
      qualified_id: z.string(),
      parent_id: z.string().nullable().optional(),
    })
    .optional(),
});

export const FlowIrSchema = z.object({
  flow_id: FlowIdSchema,
  name: z.string(),
  digest: z.string(),
  start: FlowStartConditionsSchema,
  steps: z.array(FlowStepIrSchema),
});

export type FlowStepKind = z.infer<typeof FlowStepKindSchema>;
export type FlowStepIr = z.infer<typeof FlowStepIrSchema>;
export type FlowIr = z.infer<typeof FlowIrSchema>;
