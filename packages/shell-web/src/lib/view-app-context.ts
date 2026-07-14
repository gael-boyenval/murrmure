import { VIEW_TRANSPORT_VERSION, type ViewAppContext, type ViewBranchContract } from "@murrmure/view-sdk";
import type { RunDetailPayload } from "@murrmure/shell-client";

export interface ViewRefLike {
  view_id: string;
  origin_space_id?: string;
  entry_url?: string;
  shell_route?: string;
}

export interface BuildViewAppContextInput {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  session_id?: string;
  run_id?: string;
  step_id: string;
  branches?: ViewBranchContract[];
  exec_context?: Record<string, unknown>;
  mode?: "production" | "dev";
  nonce?: string;
}

/** Build the v3 ViewAppContext for a hardened view host. No token: views never
 * hold a Hub credential and submit host-mediated via `submitBranch`. */
export function buildViewAppContext(input: BuildViewAppContextInput): ViewAppContext {
  const exec = input.exec_context ?? {};
  const stepsRaw = exec.steps;
  const steps =
    stepsRaw && typeof stepsRaw === "object" && !Array.isArray(stepsRaw)
      ? (stepsRaw as Record<string, { output?: Record<string, unknown>; status?: string }>)
      : undefined;
  const runInput =
    exec.input && typeof exec.input === "object" && !Array.isArray(exec.input)
      ? (exec.input as Record<string, unknown>)
      : undefined;

  return {
    flow_id: input.flow_id,
    space_id: input.space_id,
    hub_base_url: input.hub_base_url,
    mode: input.mode ?? "production",
    transport_version: VIEW_TRANSPORT_VERSION,
    nonce: input.nonce ?? makeViewNonce(),
    session_id: input.session_id,
    run_id: input.run_id,
    step: {
      step_id: input.step_id,
      branches: input.branches ?? [],
    },
    ...(steps ? { steps } : {}),
    ...(runInput ? { input: runInput } : {}),
  };
}

export function buildViewAppContextFromRun(
  run: RunDetailPayload,
  input: {
    hub_base_url: string;
    flow_id: string;
    space_id: string;
    mode?: "production" | "dev";
    nonce?: string;
  },
): ViewAppContext | null {
  const active = run.open_steps?.[0];
  if (!active) return null;
  return buildViewAppContext({
    flow_id: input.flow_id,
    space_id: input.space_id,
    hub_base_url: input.hub_base_url,
    session_id: run.session_id,
    run_id: run.run_id,
    step_id: active.step_id,
    branches: active.branches.map((b) => ({
      branch: b.branch,
      ...(b.schema_ref ? { schema_ref: b.schema_ref } : {}),
      ...(b.schema ? { schema: b.schema } : {}),
      payload_required: b.payload_required,
      artifact_required: b.artifact_required,
      artifact_slots: b.artifact_slots,
    })),
    exec_context: run.exec_context,
    mode: input.mode ?? "production",
    nonce: input.nonce,
  });
}

function makeViewNonce(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
