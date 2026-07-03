import type { GateItem } from "@murrmure/shell-client";

export interface GateHeaderViewModel {
  title: string;
  step_id: string;
  summary?: string;
  space_label?: string;
  space_link?: string;
  pending_label?: string;
  run_id: string;
  session_id: string;
}

export function formatGatePendingDuration(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function defaultGateTitle(gate: GateItem): string {
  if (gate.title) return gate.title;
  if (gate.step_id === "orchestration:proposed") return "Validate proposed orchestration";
  if (gate.action_name) return `Approval needed: ${gate.action_name}`;
  if (gate.step_id.startsWith("gate:")) {
    return `Review required — ${gate.step_id}`;
  }
  return `Approval needed — ${gate.step_id}`;
}

function defaultGateSummary(gate: GateItem): string | undefined {
  if (gate.summary) return gate.summary;
  if (gate.orchestration_preview?.manifest_name) {
    return `Agent proposed pipeline “${gate.orchestration_preview.manifest_name}”.`;
  }
  if (gate.action_name) {
    return `Run blocked at ${gate.action_name} until you approve or reject.`;
  }
  return `Run blocked at ${gate.step_id} until you approve or reject.`;
}

/** §6.4 — hidden spaces show label without navigation link. */
export function resolveGateSpaceContext(gate: GateItem): { space_label?: string; space_link?: string } {
  if (!gate.space_label && !gate.space_hidden) return {};
  if (gate.space_hidden) {
    return { space_label: gate.space_label ?? "Private space" };
  }
  return {
    space_label: gate.space_label,
    ...(gate.space_link ? { space_link: gate.space_link } : {}),
  };
}

export function resolveGateHeader(gate: GateItem, now = new Date()): GateHeaderViewModel {
  const space = resolveGateSpaceContext(gate);
  return {
    title: defaultGateTitle(gate),
    step_id: gate.step_id,
    summary: defaultGateSummary(gate),
    ...space,
    pending_label: gate.created_at ? formatGatePendingDuration(gate.created_at, now) : undefined,
    run_id: gate.run_id,
    session_id: gate.session_id,
  };
}
