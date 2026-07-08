import type { Capability, SessionCreatedBy } from "@murrmure/contracts";
import type { GrantRow } from "@murrmure/hub-persistence";
import { resolveEffectiveCapabilities, hasCapability } from "../grants/migrate.js";
import { shouldNotifyActor } from "../gates/redaction.js";

export type NotificationKind = "gate" | "run_failed" | "human_step";

export interface NotificationDraft {
  notification_id: string;
  actor_id: string;
  kind: NotificationKind;
  status: "pending";
  gate_id?: string;
  step_id?: string;
  run_id?: string;
  session_id?: string;
  space_id: string;
  space_hidden: boolean;
  title: string;
  summary?: string;
  expires_at?: string;
  created_at: string;
}

function grantHasStepResolve(grant: GrantRow): boolean {
  const caps = resolveEffectiveCapabilities({
    scopes: grant.scopes,
    capabilities: grant.capabilities,
  });
  return hasCapability(caps, "step:resolve");
}

/** Route human-step notifications: assignees first, else step:resolve grant holders. */
export function resolveHumanStepNotificationRecipients(input: {
  assignees?: string[];
  grants: GrantRow[];
}): string[] {
  if (input.assignees?.length) {
    return [...new Set(input.assignees)];
  }

  const recipients = new Set<string>();
  for (const grant of input.grants) {
    if (grant.status !== "active") continue;
    if (grantHasStepResolve(grant)) {
      recipients.add(grant.actor_id);
    }
  }
  return [...recipients];
}

export function buildHumanStepNotificationDrafts(input: {
  notification_id: () => string;
  now: string;
  step_id: string;
  run_id: string;
  session_id: string;
  space_id: string;
  space_name?: string;
  assignees?: string[];
  expires_at?: string;
  grants: GrantRow[];
  can_read_space: (actor_id: string) => boolean;
  fallback_actor_id?: string;
}): NotificationDraft[] {
  let recipients = resolveHumanStepNotificationRecipients({
    assignees: input.assignees,
    grants: input.grants,
  });

  if (recipients.length === 0 && input.fallback_actor_id) {
    recipients = [input.fallback_actor_id];
  }

  const drafts: NotificationDraft[] = [];
  for (const actor_id of recipients) {
    const can_read = input.can_read_space(actor_id);
    if (
      !shouldNotifyActor({
        actor_id,
        assignees: input.assignees,
        can_read_space: can_read,
        space_id: input.space_id,
        space_name: input.space_name,
      })
    ) {
      continue;
    }

    const hidden = !can_read;
    drafts.push({
      notification_id: input.notification_id(),
      actor_id,
      kind: "human_step",
      status: "pending",
      step_id: input.step_id,
      run_id: input.run_id,
      session_id: input.session_id,
      space_id: input.space_id,
      space_hidden: hidden,
      title: `Needs you: ${input.step_id}`,
      summary: hidden ? "Private space" : (input.space_name ?? input.space_id),
      expires_at: input.expires_at,
      created_at: input.now,
    });
  }

  return drafts;
}

function grantHasGateResolve(grant: GrantRow): boolean {
  const caps = resolveEffectiveCapabilities({
    scopes: grant.scopes,
    capabilities: grant.capabilities,
  });
  return hasCapability(caps, "gate:resolve");
}

/** Route gate notifications: assignees first, else gate:resolve grant holders. */
export function resolveGateNotificationRecipients(input: {
  assignees?: string[];
  grants: GrantRow[];
}): string[] {
  if (input.assignees?.length) {
    return [...new Set(input.assignees)];
  }

  const recipients = new Set<string>();
  for (const grant of input.grants) {
    if (grant.status !== "active") continue;
    if (grantHasGateResolve(grant)) {
      recipients.add(grant.actor_id);
    }
  }
  return [...recipients];
}

export function buildGateNotificationDrafts(input: {
  notification_id: () => string;
  now: string;
  gate_id: string;
  run_id: string;
  session_id: string;
  space_id: string;
  space_name?: string;
  action_name?: string;
  assignees?: string[];
  expires_at?: string;
  grants: GrantRow[];
  can_read_space: (actor_id: string) => boolean;
  fallback_actor_id?: string;
}): NotificationDraft[] {
  let recipients = resolveGateNotificationRecipients({
    assignees: input.assignees,
    grants: input.grants,
  });

  if (recipients.length === 0 && input.fallback_actor_id) {
    recipients = [input.fallback_actor_id];
  }

  const drafts: NotificationDraft[] = [];
  for (const actor_id of recipients) {
    const can_read = input.can_read_space(actor_id);
    if (
      !shouldNotifyActor({
        actor_id,
        assignees: input.assignees,
        can_read_space: can_read,
        space_id: input.space_id,
        space_name: input.space_name,
      })
    ) {
      continue;
    }

    const hidden = !can_read;
    const title = input.action_name
      ? `Approval needed: ${input.action_name}`
      : "Gate needs your decision";

    drafts.push({
      notification_id: input.notification_id(),
      actor_id,
      kind: "gate",
      status: "pending",
      gate_id: input.gate_id,
      run_id: input.run_id,
      session_id: input.session_id,
      space_id: input.space_id,
      space_hidden: hidden,
      title,
      summary: hidden ? "Private space" : (input.space_name ?? input.space_id),
      expires_at: input.expires_at,
      created_at: input.now,
    });
  }

  return drafts;
}

/** Run failed out-of-shell + in-app: session actor, creator, gate:resolve holders. */
export function resolveRunFailedNotificationRecipients(input: {
  session_actor_id?: string;
  created_by?: SessionCreatedBy;
  grants: GrantRow[];
}): string[] {
  const recipients = new Set<string>();
  if (input.session_actor_id) recipients.add(input.session_actor_id);
  if (input.created_by?.type === "actor") {
    recipients.add(input.created_by.actor_id);
  }
  for (const grant of input.grants) {
    if (grant.status !== "active") continue;
    if (grantHasGateResolve(grant)) {
      recipients.add(grant.actor_id);
    }
  }
  return [...recipients];
}

export function buildRunFailedNotificationDraft(input: {
  notification_id: () => string;
  now: string;
  run_id: string;
  session_id: string;
  space_id: string;
  space_name?: string;
  actor_id: string;
  can_read_space: boolean;
  title?: string;
  summary?: string;
}): NotificationDraft | null {
  if (!input.can_read_space) return null;

  const copy = runFailedNotificationCopy(undefined);
  return {
    notification_id: input.notification_id(),
    actor_id: input.actor_id,
    kind: "run_failed",
    status: "pending",
    run_id: input.run_id,
    session_id: input.session_id,
    space_id: input.space_id,
    space_hidden: false,
    title: input.title ?? copy.title,
    summary: input.summary ?? input.space_name ?? input.space_id,
    created_at: input.now,
  };
}

export function runFailedNotificationCopy(reason?: string): { title: string; summary?: string } {
  if (reason === "ACTION_TIMED_OUT") {
    return {
      title: "Run failed: agent action timed out",
      summary:
        "An executor exceeded its agent-work time limit. Human review wait time is excluded from action timeouts.",
    };
  }
  if (reason?.startsWith("ACTION_TIMED_OUT:")) {
    return {
      title: "Run failed: agent action timed out",
      summary: reason.slice("ACTION_TIMED_OUT:".length),
    };
  }
  return { title: "Run failed" };
}

export function actorCanReadSpace(
  effective: Capability[],
  actor_id: string,
  tokenActorId: string,
  space_id: string,
  tokenSpaceId: string,
): boolean {
  if (hasCapability(effective, "hub:admin")) return true;
  if (hasCapability(effective, "space:read") && tokenSpaceId === space_id.replace(/^spc_/, "")) {
    return true;
  }
  void actor_id;
  return hasCapability(effective, "space:read");
}
