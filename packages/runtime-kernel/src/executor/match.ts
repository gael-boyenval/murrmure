import type { Aggregate, ConditionPort, RuleArtifact } from "@runtime/contracts";

type RuleTransition = RuleArtifact["transitions"][number];

export interface MatchContext {
  aggregate: Aggregate;
  artifact: RuleArtifact;
  event: string;
  actor_id: string;
  actor_kind?: string;
  condition: ConditionPort;
}

export async function findMatchingTransition(
  ctx: MatchContext,
): Promise<RuleTransition | null> {
  const candidates = ctx.artifact.transitions.filter(
    (t) => t.from === ctx.aggregate.state && t.event === ctx.event,
  );

  for (const transition of candidates) {
    const actorOk = await ctx.condition.matchActor(
      ctx.actor_id,
      transition.actors,
      ctx.actor_kind,
    );
    if (!actorOk) continue;

    const guardOk = await ctx.condition.evaluate(transition.condition, {
      aggregate: ctx.aggregate,
      event: ctx.event,
    });
    if (!guardOk) continue;

    return transition;
  }
  return null;
}

export async function findLegalTransitionsForActor(
  ctx: Omit<MatchContext, "event">,
): Promise<Array<{ event: string; to: string; transition_id: string }>> {
  const legal: Array<{ event: string; to: string; transition_id: string }> = [];
  const fromCurrent = ctx.artifact.transitions.filter((t) => t.from === ctx.aggregate.state);

  for (const transition of fromCurrent) {
    const actorOk = await ctx.condition.matchActor(
      ctx.actor_id,
      transition.actors,
      ctx.actor_kind,
    );
    if (!actorOk) continue;
    const guardOk = await ctx.condition.evaluate(transition.condition, {
      aggregate: ctx.aggregate,
      event: transition.event,
    });
    if (!guardOk) continue;
    legal.push({ event: transition.event, to: transition.to, transition_id: transition.id });
  }
  return legal;
}

export function resolveAggregateStatus(
  state: string,
  artifact: RuleArtifact,
): Aggregate["status"] {
  const stateDef = artifact.states.find((s) => s.id === state);
  if (stateDef?.kind === "terminal") return "terminal";
  if (stateDef?.kind === "archived") return "archived";
  if (artifact.terminal_states.includes(state)) return "terminal";
  return "active";
}

export function applyTransition(
  aggregate: Aggregate,
  transition: RuleTransition,
  artifact: RuleArtifact,
  ts: string,
  metadata_patch?: Record<string, unknown>,
): Aggregate {
  const nextRevision = aggregate.revision + 1;
  const toState = transition.to;
  return {
    ...aggregate,
    state: toState,
    revision: nextRevision,
    metadata: metadata_patch ? { ...aggregate.metadata, ...metadata_patch } : aggregate.metadata,
    updated_at: ts,
    status: resolveAggregateStatus(toState, artifact),
  };
}

export function transitionAppliedPayload(
  transition: RuleTransition,
  aggregate: Aggregate,
  metadata_patch?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    transition_id: transition.id,
    event: transition.event,
    from: transition.from,
    to: transition.to,
    status: aggregate.status,
    revision: aggregate.revision,
    metadata_patch,
  };
}
