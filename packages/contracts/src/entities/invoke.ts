import { z } from "zod";
import { RunIdSchema, SessionIdSchema } from "../ids.js";
import { StepContractSliceSchema } from "./step-contract.js";

export const InvokeDeliverySchema = z.enum(["fail_fast", "queue_until_executor"]);

export const RemoteArtifactFileReferenceSchema = z.object({
  name: z.string(),
  transfer_id: z.string().optional(),
  digest: z.string().optional(),
  size_bytes: z.number().nonnegative().optional(),
});

export const RemoteArtifactSlotReferenceSchema = z.object({
  producer_step: z.string(),
  slot: z.string(),
  cardinality: z.enum(["singleton", "collection"]),
  files: z.array(RemoteArtifactFileReferenceSchema),
});

/**
 * Reference-only step contract relayed across a `remote_hub` boundary. The
 * slice is validated against `StepContractSliceSchema` after sanitization
 * (no `workdir`, reference-only `inputs_from_run`); neither the slice nor the
 * artifact references / run artifacts carry a producer host path or local
 * `.path` / `.directory` token.
 */
export const RemoteStepContractRelaySchema = z.object({
  slice: StepContractSliceSchema,
  artifact_references: z.array(RemoteArtifactSlotReferenceSchema),
  run_artifacts: z.record(z.unknown()).optional(),
  contract_key_count: z.number().nonnegative().optional(),
  hub_token: z.string().optional(),
  hub_url: z.string().optional(),
});

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
  /** Run input bag relayed from a remote hub (no host paths). */
  exec_input: z.record(z.unknown()).optional(),
  /** Reference-only step contract relayed from a remote hub (no host paths). */
  step_contract: RemoteStepContractRelaySchema.optional(),
});

export type InvokeBody = z.infer<typeof InvokeBodySchema>;

/** Agent-reported completion for async / long-running invoke steps (mcp_session, shell + MCP loop). */
export const ActionCompleteBodySchema = z.object({
  result: z.record(z.unknown()).optional(),
});

export type ActionCompleteBody = z.infer<typeof ActionCompleteBodySchema>;
