import { z } from "zod";
import { ProvenanceSchema } from "../entities/provenance.js";
import { WaitConditionSchema } from "../wait-condition.js";

export const SpaceCreateCommandSchema = z.object({
  kind: z.literal("space.create"),
  provenance: ProvenanceSchema,
  slug: z.string(),
  parent_space_id: z.string().optional(),
});

export const InstanceCreateCommandSchema = z.object({
  kind: z.literal("instance.create"),
  provenance: ProvenanceSchema,
  contract_ref_id: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const StateTransitionCommandSchema = z.object({
  kind: z.literal("state.transition"),
  provenance: ProvenanceSchema,
  event: z.string(),
  payload: z.record(z.unknown()).optional(),
  expected_revision: z.number(),
});

export const GateResolveCommandSchema = z.object({
  kind: z.literal("gate.resolve"),
  provenance: ProvenanceSchema,
  gate_id: z.string(),
  decision: z.enum(["approved", "rejected"]),
  resume_data: z.record(z.unknown()).optional(),
});

export const EventAppendCommandSchema = z.object({
  kind: z.literal("event.append"),
  provenance: ProvenanceSchema,
  event_type: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export const WaitRegisterCommandSchema = z.object({
  kind: z.literal("wait.register"),
  provenance: ProvenanceSchema,
  condition: WaitConditionSchema,
  delivery_mode: z.literal("in_process"),
  bound_command_id: z.string().optional(),
});

export const WaitCancelCommandSchema = z.object({
  kind: z.literal("wait.cancel"),
  provenance: ProvenanceSchema,
  wait_id: z.string(),
});

export const GrantMintCommandSchema = z.object({
  kind: z.literal("grant.mint"),
  provenance: ProvenanceSchema,
  actor_id: z.string(),
  scopes: z.array(z.string()),
});

export const GrantRevokeCommandSchema = z.object({
  kind: z.literal("grant.revoke"),
  provenance: ProvenanceSchema,
  grant_id: z.string(),
});

export const TriggerRegisterCommandSchema = z.object({
  kind: z.literal("trigger.register"),
  provenance: ProvenanceSchema,
  spec: z.record(z.unknown()),
});

export const TriggerScheduleCommandSchema = z.object({
  kind: z.literal("trigger.schedule"),
  provenance: ProvenanceSchema,
  cron: z.string().max(512),
  spec: z.record(z.unknown()),
});

export const BlobWriteCommandSchema = z.object({
  kind: z.literal("blob.write"),
  provenance: ProvenanceSchema,
  media_type: z.string(),
  content_base64: z.string(),
});

export const QueryAskCommandSchema = z.object({
  kind: z.literal("query.ask"),
  provenance: ProvenanceSchema,
  query_id: z.string(),
  schema: z.record(z.unknown()),
  payload: z.record(z.unknown()).optional(),
});

export const QueryAnswerCommandSchema = z.object({
  kind: z.literal("query.answer"),
  provenance: ProvenanceSchema,
  query_id: z.string(),
  payload: z.record(z.unknown()),
});

export const FederationEmitCommandSchema = z.object({
  kind: z.literal("federation.emit"),
  provenance: ProvenanceSchema,
  target_hub_id: z.string(),
  event_type: z.string(),
  payload: z.record(z.unknown()),
});

export const InstanceMetadataPatchCommandSchema = z.object({
  kind: z.literal("instance.metadata.patch"),
  provenance: ProvenanceSchema,
  patch: z.record(z.unknown()),
  expected_revision: z.number(),
});

export type SpaceCreateCommand = z.infer<typeof SpaceCreateCommandSchema>;
export type InstanceCreateCommand = z.infer<typeof InstanceCreateCommandSchema>;
export type StateTransitionCommand = z.infer<typeof StateTransitionCommandSchema>;
export type GateResolveCommand = z.infer<typeof GateResolveCommandSchema>;
export type EventAppendCommand = z.infer<typeof EventAppendCommandSchema>;
export type WaitRegisterCommand = z.infer<typeof WaitRegisterCommandSchema>;
export type WaitCancelCommand = z.infer<typeof WaitCancelCommandSchema>;
export type BlobWriteCommand = z.infer<typeof BlobWriteCommandSchema>;
export type GrantMintCommand = z.infer<typeof GrantMintCommandSchema>;
export type GrantRevokeCommand = z.infer<typeof GrantRevokeCommandSchema>;
export type QueryAskCommand = z.infer<typeof QueryAskCommandSchema>;
export type QueryAnswerCommand = z.infer<typeof QueryAnswerCommandSchema>;
export type FederationEmitCommand = z.infer<typeof FederationEmitCommandSchema>;
export type TriggerRegisterCommand = z.infer<typeof TriggerRegisterCommandSchema>;
export type TriggerScheduleCommand = z.infer<typeof TriggerScheduleCommandSchema>;
export type InstanceMetadataPatchCommand = z.infer<typeof InstanceMetadataPatchCommandSchema>;

export type StudioCommand =
  | SpaceCreateCommand
  | InstanceCreateCommand
  | StateTransitionCommand
  | GateResolveCommand
  | EventAppendCommand
  | WaitRegisterCommand
  | WaitCancelCommand
  | GrantMintCommand
  | GrantRevokeCommand
  | QueryAskCommand
  | QueryAnswerCommand
  | FederationEmitCommand
  | TriggerRegisterCommand
  | TriggerScheduleCommand
  | BlobWriteCommand
  | InstanceMetadataPatchCommand;
