import type { SessionCreatedBy } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { GrantRow } from "@murrmure/hub-persistence";
import { stripGateId } from "../bridge/ids.js";
import {
  resolveGateNotificationRecipients,
  resolveRunFailedNotificationRecipients,
} from "../projections/notifications.js";

export const OUT_OF_SHELL_JOURNAL_TYPES = new Set<string>([
  JOURNAL_EVENT_TYPES.GATE_PENDING,
  JOURNAL_EVENT_TYPES.RUN_FAILED,
]);

export function shouldDispatchOutOfShell(event_type: string): boolean {
  return OUT_OF_SHELL_JOURNAL_TYPES.has(event_type);
}

export interface NotifyChannelPrefs {
  notify_email?: boolean;
  notify_desktop?: boolean;
}

export interface DesktopOutOfShellPayload {
  actor_id: string;
  kind: "gate" | "run_failed";
  title: string;
  body?: string;
  deep_link: string;
  gate_id?: string;
  run_id?: string;
  session_id?: string;
  space_id?: string;
}

export interface EmailOutOfShellPayload {
  actor_id: string;
  gate_id?: string;
  subject: string;
  body_text: string;
  run_url: string;
}

export interface OutOfShellDispatchPlan {
  actor_id: string;
  gate_id?: string;
  desktop?: DesktopOutOfShellPayload;
  email?: EmailOutOfShellPayload;
}

export function buildMurrmureDeepLink(input: { run_id: string; gate_id?: string }): string {
  const run = input.run_id.startsWith("run_") ? input.run_id : `run_${input.run_id}`;
  if (!input.gate_id) return `murrmure://runs/${run}`;
  const gate = input.gate_id.startsWith("chk_") ? input.gate_id : `chk_${input.gate_id}`;
  return `murrmure://runs/${run}?gate=${encodeURIComponent(gate)}`;
}

export function buildShellRunUrl(shell_base_url: string, run_id: string, gate_id?: string): string {
  const base = shell_base_url.replace(/\/$/, "");
  const run = run_id.startsWith("run_") ? run_id : `run_${run_id}`;
  if (!gate_id) return `${base}/runs/${encodeURIComponent(run)}`;
  const gate = gate_id.startsWith("chk_") ? gate_id : `chk_${gate_id}`;
  return `${base}/runs/${encodeURIComponent(run)}?gate=${encodeURIComponent(gate)}`;
}

function channelEnabled(prefs: NotifyChannelPrefs, channel: "notify_email" | "notify_desktop"): boolean {
  const value = prefs[channel];
  return value !== false;
}

export function planOutOfShellDispatches(input: {
  event_type: string;
  space_id: string;
  session_id?: string;
  run_id?: string;
  actor_id?: string;
  data?: Record<string, unknown>;
  grants: GrantRow[];
  session_actor_id?: string;
  created_by?: SessionCreatedBy;
  space_name?: string;
  shell_base_url?: string;
  get_prefs: (actor_id: string) => NotifyChannelPrefs;
}): OutOfShellDispatchPlan[] {
  if (!shouldDispatchOutOfShell(input.event_type)) return [];
  if (!input.run_id) return [];

  const assignees = Array.isArray(input.data?.assignees)
    ? (input.data.assignees as string[])
    : undefined;
  const action_name =
    typeof input.data?.action_name === "string" ? input.data.action_name : undefined;
  const gate_id_raw =
    typeof input.data?.gate_id === "string" ? input.data.gate_id : undefined;

  let recipientIds: string[] = [];
  let kind: "gate" | "run_failed";
  let title: string;
  let body: string | undefined = input.space_name;
  let gate_id: string | undefined = gate_id_raw;

  if (input.event_type === JOURNAL_EVENT_TYPES.GATE_PENDING) {
    kind = "gate";
    recipientIds = resolveGateNotificationRecipients({
      assignees,
      grants: input.grants,
    });
    if (recipientIds.length === 0 && input.actor_id) {
      recipientIds = [input.actor_id];
    }
    title = action_name ? `Approval needed: ${action_name}` : "Gate needs your decision";
  } else if (input.event_type === JOURNAL_EVENT_TYPES.RUN_FAILED) {
    kind = "run_failed";
    gate_id = undefined;
    recipientIds = resolveRunFailedNotificationRecipients({
      session_actor_id: input.session_actor_id,
      created_by: input.created_by,
      grants: input.grants,
    });
    title = "Run failed";
  } else {
    return [];
  }

  const plans: OutOfShellDispatchPlan[] = [];
  for (const actor_id of recipientIds) {
    const prefs = input.get_prefs(actor_id);
    const desktopEnabled = channelEnabled(prefs, "notify_desktop");
    const emailEnabled = channelEnabled(prefs, "notify_email");
    if (!desktopEnabled && !emailEnabled) continue;

    const deep_link = buildMurrmureDeepLink({ run_id: input.run_id, gate_id });
    const run_url = buildShellRunUrl(input.shell_base_url ?? "http://127.0.0.1:8787", input.run_id, gate_id);
    const gateBare = gate_id ? stripGateId(gate_id) : undefined;

    const plan: OutOfShellDispatchPlan = { actor_id, gate_id: gateBare };
    if (desktopEnabled) {
      plan.desktop = {
        actor_id,
        kind,
        title,
        body,
        deep_link,
        gate_id,
        run_id: input.run_id,
        session_id: input.session_id,
        space_id: input.space_id,
      };
    }
    if (emailEnabled) {
      plan.email = {
        actor_id,
        gate_id: gateBare,
        subject: title,
        body_text: body ?? title,
        run_url,
      };
    }
    if (plan.desktop || plan.email) {
      plans.push(plan);
    }
  }

  return plans;
}

/** Max one gate email per 15 minutes (global per gate). */
export class GateEmailRateLimiter {
  private readonly lastSent = new Map<string, number>();

  constructor(private readonly windowMs = 15 * 60 * 1000) {}

  canSend(gate_id: string, now = Date.now()): boolean {
    const last = this.lastSent.get(gate_id);
    if (last === undefined) return true;
    return now - last >= this.windowMs;
  }

  record(gate_id: string, now = Date.now()): void {
    this.lastSent.set(gate_id, now);
  }
}
