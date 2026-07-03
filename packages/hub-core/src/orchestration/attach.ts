import { FlowAttachPayloadSchema } from "@murrmure/contracts";
import type { Capability, FlowManifest, GateForm } from "@murrmure/contracts";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { createPendingGate, type GateServiceDeps } from "../gates/service.js";
import { hasCapability } from "../grants/migrate.js";
import { parseFlowManifest } from "../flow-engine/parse.js";
import { createRun, type SessionRunDeps } from "../run/service.js";
import { bindOrchestrationToRun } from "./bind.js";
import { buildOrchestrationPreview } from "./preview.js";

export const ORCHESTRATION_VALIDATE_ACTION = "orchestration.validate";
export const ORCHESTRATION_PROPOSED_STEP = "orchestration:proposed";

export interface OrchestrationAttachDeps extends GateServiceDeps, SessionRunDeps {}

export interface AttachOrchestrationInput {
  session_id: string;
  space_id: string;
  payload: unknown;
  actor_id: string;
  token_id: string;
  capabilities: Capability[];
  breakglass?: boolean;
}

export type AttachOrchestrationResult =
  | {
      ok: true;
      run_id: string;
      gate_id?: string;
      preview: ReturnType<typeof buildOrchestrationPreview>;
      bound?: boolean;
    }
  | { ok: false; error: { code: string; message: string } };

function orchestrationForm(): GateForm {
  return {
    id: "orchestration.validate.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"], required: true },
      { name: "notes", type: "string", required: false },
    ],
  };
}

function pendingPayloadRef(manifest: FlowManifest, flow_id: string) {
  const preview = buildOrchestrationPreview(manifest, flow_id);
  return JSON.stringify({
    kind: "murrmure.orchestration.pending/v1",
    flow_id,
    manifest,
    preview,
  });
}

export async function attachOrchestration(
  deps: OrchestrationAttachDeps,
  input: AttachOrchestrationInput,
): Promise<AttachOrchestrationResult> {
  if (!hasCapability(input.capabilities, "flow:run")) {
    return {
      ok: false,
      error: { code: "SCOPE_ENFORCEMENT_FAILURE", message: "flow:run required on session" },
    };
  }

  const parsedPayload = FlowAttachPayloadSchema.safeParse(input.payload);
  if (!parsedPayload.success) {
    return {
      ok: false,
      error: { code: "INVALID_ATTACH_PAYLOAD", message: "Expected murrmure.flow.attach/v1 payload" },
    };
  }

  const manifestResult = parseFlowManifest(parsedPayload.data.manifest);
  if (!manifestResult.ok) {
    return {
      ok: false,
      error: { code: manifestResult.code, message: manifestResult.message },
    };
  }

  const manifest = manifestResult.value;
  const flow_id = `flw_orch_${deps.ids.ulid()}`;
  const preview = buildOrchestrationPreview(manifest, flow_id);
  const spacePrefixed = addSpaceId(stripSpaceId(input.space_id));

  const runResult = await createRun(deps, {
    session_id: input.session_id,
    space_id: spacePrefixed,
    flow_id: null,
    input_params: { _orchestration_pending: true },
    actor_id: input.actor_id,
    token_id: input.token_id,
    capabilities: input.capabilities,
  });

  if ("error" in runResult) {
    return { ok: false, error: runResult.error ?? { code: "RUN_CREATE_FAILED", message: "Run creation failed" } };
  }

  const runBare = runResult.run.run_id.replace(/^run_/, "");
  await deps.studio.updateRunLifecycle(runBare, "input-required");

  const skipGate =
    input.breakglass === true && hasCapability(input.capabilities, "hub:admin");

  if (skipGate) {
    const bound = await bindOrchestrationToRun(deps, {
      run_id: runResult.run.run_id,
      session_id: input.session_id,
      space_id: spacePrefixed,
      manifest,
      flow_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities,
    });
    if ("error" in bound) {
      return { ok: false, error: bound.error };
    }
    return {
      ok: true,
      run_id: runResult.run.run_id,
      preview,
      bound: true,
    };
  }

  const gate = await createPendingGate(deps, {
    run_id: runResult.run.run_id,
    session_id: input.session_id,
    space_id: spacePrefixed,
    step_id: ORCHESTRATION_PROPOSED_STEP,
    action_name: ORCHESTRATION_VALIDATE_ACTION,
    form: orchestrationForm(),
    payload_ref: pendingPayloadRef(manifest, flow_id),
    actor_id: input.actor_id,
    token_id: input.token_id,
  });

  return {
    ok: true,
    run_id: runResult.run.run_id,
    gate_id: gate.gate_id,
    preview,
  };
}
