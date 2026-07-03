import { z } from "zod";
import { CapabilitySchema } from "../grants/capability.js";
import { GateFormSchema } from "../entities/gate.js";

export const FlowStartEventSchema = z.object({
  type: z.string(),
  source: z.string().optional(),
});

export type FlowStartEvent = z.infer<typeof FlowStartEventSchema>;

export const FlowStartConditionsSchema = z.object({
  manual: z.boolean().optional(),
  flow_call: z.boolean().optional(),
  events: z.array(FlowStartEventSchema).optional(),
  schedule: z.string().nullable().optional(),
  requires_view: z.string().nullable().optional(),
  idempotency: z.string().optional(),
});

export const FlowStartFlowStepSchema = z.object({
  flow_id: z.string(),
  input: z.record(z.unknown()).optional(),
  wait: z.boolean().optional(),
  continue_on_error: z.boolean().optional(),
});

export const FlowInvokeStepSchema = z.object({
  space: z.string(),
  action: z.string(),
  params: z.record(z.unknown()).optional(),
  artifacts_in: z.array(z.string()).optional(),
});

export const FlowGateStepSchema = z.object({
  form: GateFormSchema.optional(),
  assignees: z.array(z.string()).optional(),
});

export const FlowCheckpointOnResolveRouteSchema = z.object({
  goto: z.string().optional(),
  fail: z.boolean().optional(),
});

export const FlowCheckpointOnResolveSchema = z.object({
  when: z.string().optional(),
  values: z.record(FlowCheckpointOnResolveRouteSchema).optional(),
  default: FlowCheckpointOnResolveRouteSchema.optional(),
  cancel: FlowCheckpointOnResolveRouteSchema.optional(),
});

export const FlowCheckpointStepSchema = z.object({
  view: z.string(),
  assignees: z.array(z.string()).optional(),
  merge_input: z.boolean().optional(),
  payload_ref: z.string().optional(),
  on_resolve: FlowCheckpointOnResolveSchema.optional(),
  responseSchema: z.string().optional(),
});

export const FlowLaneStepSchema: z.ZodType<FlowLaneStep> = z.lazy(() =>
  z.object({
    id: z.string(),
    invoke: FlowInvokeStepSchema.optional(),
    gate: FlowGateStepSchema.optional(),
  }),
);

export type FlowLaneStep = {
  id: string;
  invoke?: z.infer<typeof FlowInvokeStepSchema>;
  gate?: z.infer<typeof FlowGateStepSchema>;
};

export const FlowParallelStepSchema = z.object({
  matrix: z.string(),
  lane: z.array(FlowLaneStepSchema).min(1),
});

export const FlowStepSchema: z.ZodType<FlowStep> = z.lazy(() =>
  z.object({
    id: z.string(),
    invoke: FlowInvokeStepSchema.optional(),
    parallel: FlowParallelStepSchema.optional(),
    gate: FlowGateStepSchema.optional(),
    checkpoint: FlowCheckpointStepSchema.optional(),
    start_flow: FlowStartFlowStepSchema.optional(),
  }),
);

export type FlowStep = {
  id: string;
  invoke?: z.infer<typeof FlowInvokeStepSchema>;
  parallel?: z.infer<typeof FlowParallelStepSchema>;
  gate?: z.infer<typeof FlowGateStepSchema>;
  checkpoint?: z.infer<typeof FlowCheckpointStepSchema>;
  start_flow?: z.infer<typeof FlowStartFlowStepSchema>;
};

export const FlowManifestSchema = z.object({
  apiVersion: z.literal("murrmure.flow/v1"),
  name: z.string(),
  description: z.string().optional(),
  triggers: FlowStartConditionsSchema.optional(),
  start: FlowStartConditionsSchema,
  grants: z
    .object({
      suggested: z.array(CapabilitySchema).optional(),
    })
    .optional(),
  steps: z.array(FlowStepSchema),
});

export type FlowStartConditions = z.infer<typeof FlowStartConditionsSchema>;
export type FlowManifest = z.infer<typeof FlowManifestSchema>;
