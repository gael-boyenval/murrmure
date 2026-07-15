import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { Gate, GateForm } from "@murrmure/contracts";
import type { GateRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HubHandler } from "../handlers/hub.js";
import { addGateId, addSpaceId, stripGateId } from "../bridge/ids.js";

function prefixedRun(bare: string): string {
  return bare.startsWith("run_") ? bare : `run_${bare}`;
}

function prefixedSession(bare: string): string {
  return bare.startsWith("ses_") ? bare : `ses_${bare}`;
}
import { buildGateNotificationDrafts } from "../projections/notifications.js";
import { failRunWithNotification } from "../run/service.js";
import { sanitizeGateContext } from "./redaction.js";
import {
  bindOrchestrationFromGate,
  isOrchestrationGate,
  rejectOrchestrationGate,
  type OrchestrationBindDeps,
} from "../orchestration/bind.js";
import { parseOrchestrationPayloadRef, type OrchestrationPreview } from "../orchestration/preview.js";
import type { Capability } from "@murrmure/contracts";
import { canResolveGate, hasCapability, resolveEffectiveCapabilities } from "../grants/migrate.js";

export interface GateServiceDeps extends Partial<OrchestrationBindDeps> {
  studio: StudioPersistencePort;
  handler: HubHandler;
  ids: { ulid: () => string };
  clock: { nowIso: () => string };
}

function rowToGate(row: GateRow): Gate {
  return {
    gate_id: addGateId(row.gate_id),
    run_id: prefixedRun(row.run_id),
    session_id: prefixedSession(row.session_id),
    step_id: row.step_id,
    status: row.status,
    assignees: row.assignees,
    resolve_mode: "any_one",
    expires_at: row.expires_at,
    form: row.form,
    payload_ref: row.payload_ref,
  };
}

export async function createPendingGate(
  deps: GateServiceDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    step_id: string;
    assignees?: string[];
    form?: GateForm;
    payload_ref?: string;
    action_name?: string;
    expires_at?: string;
    actor_id: string;
    token_id: string;
  },
): Promise<Gate> {
  const gateBare = deps.ids.ulid();
  const runBare = input.run_id.startsWith("run_") ? input.run_id.slice(4) : input.run_id;
  const sessionBare = input.session_id.startsWith("ses_") ? input.session_id.slice(4) : input.session_id;
  const spaceBare = input.space_id.startsWith("spc_") ? input.space_id.slice(4) : input.space_id;
  const now = deps.clock.nowIso();

  const row: GateRow = {
    gate_id: gateBare,
    run_id: runBare,
    session_id: sessionBare,
    space_id: spaceBare,
    step_id: input.step_id,
    status: "pending",
    assignees: input.assignees,
    resolve_mode: "any_one",
    expires_at: input.expires_at,
    form: input.form,
    payload_ref: input.payload_ref,
    action_name: input.action_name,
    created_at: now,
  };

  await deps.studio.insertGate(row);

  const run = await deps.studio.getRun(runBare);
  if (run && run.lifecycle !== "input-required") {
    await deps.studio.updateRunLifecycle(runBare, "input-required");
  }

  const space = await deps.studio.getSpace(spaceBare);
  const grants = await deps.studio.listGrants(spaceBare);

  const drafts = buildGateNotificationDrafts({
    notification_id: () => deps.ids.ulid(),
    now,
      gate_id: addGateId(gateBare),
      run_id: prefixedRun(runBare),
      session_id: prefixedSession(sessionBare),
    space_id: addSpaceId(spaceBare),
    space_name: space?.name ?? space?.slug,
    action_name: input.action_name,
    assignees: input.assignees,
    expires_at: input.expires_at,
    grants,
    can_read_space: (actorId) => {
      const actorGrants = grants.filter((g) => g.actor_id === actorId && g.status === "active");
      return actorGrants.some((g) => g.scopes.includes("space:read"));
    },
    fallback_actor_id: input.actor_id,
  });

  for (const draft of drafts) {
    await deps.studio.insertNotification({
      notification_id: draft.notification_id,
      actor_id: draft.actor_id,
      kind: draft.kind,
      status: draft.status,
      gate_id: gateBare,
      run_id: runBare,
      session_id: sessionBare,
      space_id: spaceBare,
      space_hidden: draft.space_hidden ? 1 : 0,
      title: draft.title,
      summary: draft.summary,
      expires_at: draft.expires_at,
      created_at: draft.created_at,
    });
  }

  await deps.handler.appendSpaceJournal({
    space_id: addSpaceId(spaceBare),
    type: JOURNAL_EVENT_TYPES.GATE_PENDING,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: prefixedSession(sessionBare),
    run_id: prefixedRun(runBare),
    data: {
      gate_id: addGateId(gateBare),
      step_id: input.step_id,
      assignees: input.assignees ?? [],
      action_name: input.action_name,
    },
  });

  return rowToGate(row);
}

export async function listGatesForRun(deps: GateServiceDeps, run_id: string): Promise<Gate[]> {
  const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
  const rows = await deps.studio.listGatesByRun(bare);
  return rows.map(rowToGate);
}

export async function getGateById(deps: GateServiceDeps, gate_id: string): Promise<GateRow | null> {
  const bare = stripGateId(gate_id);
  return deps.studio.getGate(bare);
}

export interface GateResolveInput {
  gate_id: string;
  actor_id: string;
  token_id: string;
  /** Token space — when provided, resolveGate rejects if it does not match the
   *  gate's space (unless the token is bootstrap or holds hub:admin). */
  space_id?: string;
  /** Normative v2 wire */
  disposition?: "continue" | "cancel";
  output?: Record<string, unknown>;
  /** Legacy wire — mapped to disposition + output during migration */
  decision?: "approved" | "rejected";
  resume_data?: Record<string, unknown>;
  form_values?: Record<string, unknown>;
  can_resolve?: boolean;
  capabilities?: Capability[];
}

function mapGateResolveInput(input: GateResolveInput): {
  disposition: "continue" | "cancel";
  output: Record<string, unknown>;
  decision: "approved" | "rejected";
} {
  if (input.disposition) {
    const output = {
      ...(input.output ?? {}),
      ...(input.form_values ?? {}),
    };
    return {
      disposition: input.disposition,
      output,
      decision: input.disposition === "continue" ? "approved" : "rejected",
    };
  }

  const decision = input.decision === "rejected" ? "rejected" : "approved";
  const output = {
    ...(input.resume_data ?? {}),
    ...(input.form_values ?? {}),
    ...(input.output ?? {}),
  };
  return {
    disposition: decision === "approved" ? "continue" : "cancel",
    output,
    decision,
  };
}

export async function resolveGate(
  deps: GateServiceDeps,
  input: GateResolveInput,
): Promise<{ gate: Gate; error?: { code: string; message: string } }> {
  const bare = stripGateId(input.gate_id);
  const row = await deps.studio.getGate(bare);
  if (!row) {
    return { gate: {} as Gate, error: { code: "gate_not_found", message: "Gate not found" } };
  }
  if (row.status !== "pending") {
    return {
      gate: rowToGate(row),
      error: { code: "gate_terminal", message: "Gate already resolved" },
    };
  }

  // Space boundary: a token may only resolve a gate in its own space. Bootstrap
  // and hub:admin tokens are privileged and may resolve gates cross-space. The
  // HTTP route (POST /v1/gates/:gate_id/resolve) enforces the same check; this
  // guard defends any other caller of resolveGate.
  if (input.space_id) {
    const isPrivileged =
      input.space_id === "bootstrap" || hasCapability(input.capabilities ?? [], "hub:admin");
    if (!isPrivileged) {
      const tokenSpaceBare = input.space_id.startsWith("spc_") ? input.space_id.slice(4) : input.space_id;
      if (tokenSpaceBare !== row.space_id) {
        return {
          gate: rowToGate(row),
          error: { code: "SCOPE_ENFORCEMENT_FAILURE", message: "token space does not match gate space" },
        };
      }
    }
  }

  const grants = await deps.studio.listGrants(row.space_id);
  const actorGrants = grants.filter((g) => g.actor_id === input.actor_id && g.status === "active");
  const grantCanResolve = actorGrants.some((g) =>
    canResolveGate(resolveEffectiveCapabilities({ scopes: g.scopes, capabilities: g.capabilities })),
  );
  const canResolve =
    input.can_resolve === true ||
    row.assignees?.includes(input.actor_id) ||
    grantCanResolve ||
    (!row.assignees?.length && grantCanResolve);

  if (!canResolve) {
    return {
      gate: rowToGate(row),
      error: { code: "SCOPE_ENFORCEMENT_FAILURE", message: "flow:run required" },
    };
  }

  const now = deps.clock.nowIso();
  const mapped = mapGateResolveInput(input);
  const { disposition, output, decision } = mapped;
  const status = decision === "approved" ? "approved" : "rejected";

  await deps.studio.updateGateStatus(bare, status, {
    resolved_at: now,
    resolved_by: input.actor_id,
    decision,
  });

  await deps.studio.resolveNotificationsForGate(bare, now);

  const run = await deps.studio.getRun(row.run_id);
  const orchestration = isOrchestrationGate(row);

  if (orchestration && decision === "approved") {
    const bindResult = await bindOrchestrationFromGate(deps, {
      gate: row,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities ?? ["flow:run"],
    });
    if ("error" in bindResult) {
      return { gate: rowToGate(row), error: bindResult.error };
    }
  } else if (orchestration && decision === "rejected") {
    await rejectOrchestrationGate(deps, row);
  } else if (run && run.lifecycle === "input-required" && decision === "approved") {
    await deps.studio.updateRunLifecycle(row.run_id, "working");
  } else if (run && decision === "rejected") {
    await failRunWithNotification(deps, {
      run_id: prefixedRun(row.run_id),
      actor_id: input.actor_id,
      token_id: input.token_id,
      reason: "gate_rejected",
    });
  }

  await deps.handler.appendSpaceJournal({
    space_id: addSpaceId(row.space_id),
    type: JOURNAL_EVENT_TYPES.GATE_RESOLVED,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: prefixedSession(row.session_id),
    run_id: prefixedRun(row.run_id),
    data: {
      gate_id: addGateId(bare),
      disposition,
      output,
      decision,
      form_values: input.form_values,
      resume_data: input.resume_data,
    },
  });

  const updated = (await deps.studio.getGate(bare))!;
  return { gate: rowToGate(updated) };
}

export function presentGateForActor(
  gate: Gate,
  row: GateRow,
  input: { actor_id: string; can_read_space: boolean; space_name?: string },
): Gate & {
  space_label: string;
  space_hidden: boolean;
  space_link?: string;
  orchestration_preview?: OrchestrationPreview;
  created_at: string;
  action_name?: string;
  title: string;
  summary: string;
} {
  const space = addSpaceId(row.space_id);
  const ctx = sanitizeGateContext({
    actor_id: input.actor_id,
    assignees: gate.assignees,
    can_read_space: input.can_read_space,
    space_id: space,
    space_name: input.space_name,
    action_name: row.action_name,
  });

  const pending = isOrchestrationGate(row) ? parseOrchestrationPayloadRef(row.payload_ref) : null;

  return {
    ...gate,
    created_at: row.created_at,
    ...(row.action_name ? { action_name: row.action_name } : {}),
    space_label: ctx.space_label,
    space_hidden: ctx.space_hidden,
    ...(ctx.space_link ? { space_link: ctx.space_link } : {}),
    ...(pending ? { orchestration_preview: pending.preview } : {}),
    title:
      row.step_id === "orchestration:proposed"
        ? "Validate proposed orchestration"
        : row.action_name
          ? `Approval needed: ${row.action_name}`
          : row.step_id.startsWith("gate:")
            ? `Review required — ${row.step_id}`
            : `Approval needed — ${row.step_id}`,
    summary: pending
      ? `Agent proposed pipeline “${pending.preview.manifest_name}”.`
      : row.action_name
        ? `Run blocked at ${row.action_name} until you approve or reject.`
        : `Run blocked at ${row.step_id} until you approve or reject.`,
  };
}
