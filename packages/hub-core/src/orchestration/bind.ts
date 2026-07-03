import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { Capability, FlowIndexEntry, FlowIndexRow, FlowManifest, SpaceIndexSnapshot } from "@murrmure/contracts";
import type { GateRow } from "@murrmure/hub-persistence";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { compileFlowIr } from "../flow-engine/compile.js";
import { collectStepSpaces } from "../index/parse-flow-manifest.js";
import { prepareFlowStart } from "../flow-engine/start.js";
import type { FlowStepDispatch } from "../flow-engine/types.js";
import type { SessionRunDeps } from "../run/service.js";
import { refreshSessionStatus } from "../session/index.js";
import { ORCHESTRATION_VALIDATE_ACTION } from "./attach.js";
import { parseOrchestrationPayloadRef } from "./preview.js";

export interface OrchestrationBindDeps extends SessionRunDeps {
  dispatchSteps?: (input: {
    dispatch: FlowStepDispatch[];
    session_id: string;
    run_id: string;
    actor_id: string;
    token_id: string;
  }) => Promise<void>;
}

export async function upsertEphemeralFlowEntry(
  studio: SessionRunDeps["studio"],
  space_id: string,
  entry: FlowIndexEntry,
): Promise<void> {
  const bare = stripSpaceId(space_id);
  const current = await studio.getSpaceIndexSnapshot(bare);
  const next: SpaceIndexSnapshot = {
    actions: current.actions,
    executors: current.executors,
    hooks: current.hooks,
    events: current.events ?? [],
    flows: [
      ...current.flows.filter((f) => f.flow_id !== entry.flow_id),
      { ...entry, payload_json: JSON.stringify(entry) } as FlowIndexRow,
    ],
  };
  await studio.replaceSpaceIndex(bare, next);
}

export async function bindOrchestrationToRun(
  deps: OrchestrationBindDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    manifest: FlowManifest;
    flow_id: string;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
  },
): Promise<{ dispatch: FlowStepDispatch[] } | { error: { code: string; message: string } }> {
  const runBare = input.run_id.replace(/^run_/, "");
  const run = await deps.studio.getRun(runBare);
  if (!run) {
    return { error: { code: "RUN_NOT_FOUND", message: "Run not found" } };
  }

  const ir = compileFlowIr(input.manifest, input.flow_id);
  const entry: FlowIndexEntry = {
    flow_id: input.flow_id,
    origin_space_id: input.space_id,
    digest: ir.digest,
    name: input.manifest.name,
    start: input.manifest.start,
    step_spaces: collectStepSpaces(input.manifest, input.space_id).map((s) =>
      s.startsWith("spc_") ? (s as FlowIndexEntry["step_spaces"][number]) : (`spc_${stripSpaceId(s)}` as FlowIndexEntry["step_spaces"][number]),
    ),
    grants_required: ["flow:run"],
    ir,
  };

  await upsertEphemeralFlowEntry(deps.studio, input.space_id, entry);

  await deps.studio.updateRunFlowBinding(runBare, {
    flow_id: input.flow_id,
    flow_digest: ir.digest,
    exec_context: {
      ...run.exec_context,
      _orchestration_pending: undefined,
      input: run.exec_context.input ?? {},
    },
  });

  await deps.handler.appendSpaceJournal({
    type: JOURNAL_EVENT_TYPES.FLOW_ATTACHED,
    space_id: input.space_id,
    session_id: input.session_id,
    run_id: input.run_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
    data: {
      flow_id: input.flow_id,
      flow_digest: ir.digest,
      manifest_name: input.manifest.name,
    },
  });

  const prepared = prepareFlowStart(entry, {
    exec_context: {
      ...run.exec_context,
      input: (run.exec_context.input as Record<string, unknown>) ?? {},
    },
    origin_space_id: input.space_id,
    capabilities: input.capabilities,
    mode: "manual",
  });

  if ("code" in prepared) {
    return { error: { code: prepared.code, message: prepared.message } };
  }

  await deps.studio.updateRunLifecycle(runBare, "working");

  if (prepared.dispatch.length && deps.dispatchSteps) {
    await deps.dispatchSteps({
      dispatch: prepared.dispatch,
      session_id: input.session_id,
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
  }

  await refreshSessionStatus(deps.studio, run.session_id);
  return { dispatch: prepared.dispatch };
}

export async function bindOrchestrationFromGate(
  deps: OrchestrationBindDeps,
  input: {
    gate: GateRow;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
  },
): Promise<{ dispatch: FlowStepDispatch[] } | { error: { code: string; message: string } }> {
  if (input.gate.action_name !== ORCHESTRATION_VALIDATE_ACTION) {
    return { error: { code: "NOT_ORCHESTRATION_GATE", message: "Gate is not orchestration.validate" } };
  }

  const pending = parseOrchestrationPayloadRef(input.gate.payload_ref);
  if (!pending) {
    return { error: { code: "INVALID_GATE_PAYLOAD", message: "Missing orchestration manifest on gate" } };
  }

  return bindOrchestrationToRun(deps, {
    run_id: `run_${input.gate.run_id}`,
    session_id: `ses_${input.gate.session_id}`,
    space_id: addSpaceId(input.gate.space_id),
    manifest: pending.manifest,
    flow_id: pending.flow_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
    capabilities: input.capabilities,
  });
}

export async function rejectOrchestrationGate(
  deps: SessionRunDeps,
  gate: GateRow,
): Promise<void> {
  const ts = deps.clock.nowIso();
  await deps.studio.updateRunLifecycle(gate.run_id, "cancelled", ts);
  await refreshSessionStatus(deps.studio, gate.session_id);
}

export function isOrchestrationGate(gate: GateRow): boolean {
  return gate.action_name === ORCHESTRATION_VALIDATE_ACTION;
}
