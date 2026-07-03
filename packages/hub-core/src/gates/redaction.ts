import type { Gate } from "@murrmure/contracts";

export interface GateVisibilityInput {
  actor_id: string;
  assignees?: string[];
  can_read_space: boolean;
  space_name?: string;
  space_id: string;
}

export interface SanitizedGateContext {
  visible: boolean;
  space_hidden: boolean;
  space_label: string;
  space_link?: string;
  action_name?: string;
}

/** rev-1 §6.4 — hidden space gate notification rules; cross-hub steps sanitized. */
export function sanitizeGateContext(input: GateVisibilityInput & { action_name?: string; federated?: boolean }): SanitizedGateContext {
  const isAssignee =
    !input.assignees?.length || input.assignees.includes(input.actor_id);

  if (input.federated) {
    return {
      visible: true,
      space_hidden: false,
      space_label: "Remote space",
      action_name: input.action_name,
    };
  }

  if (!input.can_read_space && !isAssignee) {
    return {
      visible: false,
      space_hidden: true,
      space_label: "Private space",
    };
  }

  if (input.can_read_space) {
    return {
      visible: true,
      space_hidden: false,
      space_label: input.space_name ?? input.space_id,
      space_link: `/spaces/${input.space_id}`,
      action_name: input.action_name,
    };
  }

  return {
    visible: true,
    space_hidden: true,
    space_label: "Private space",
    action_name: input.action_name,
  };
}

export function shouldNotifyActor(input: GateVisibilityInput): boolean {
  return sanitizeGateContext(input).visible;
}

export function redactGateForActor(gate: Gate, input: GateVisibilityInput): Gate & { space_label: string; space_link?: string } {
  const ctx = sanitizeGateContext({ ...input, action_name: undefined });
  return {
    ...gate,
    space_label: ctx.space_label,
    ...(ctx.space_link ? { space_link: ctx.space_link } : {}),
  } as Gate & { space_label: string; space_link?: string };
}
