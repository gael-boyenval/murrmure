export interface ConditionPort {
  evaluate(condition: string | null, ctx: Record<string, unknown>): Promise<boolean>;
  matchActor(actor_id: string, patterns: string[], actor_kind?: string): Promise<boolean>;
  matchAssignee(actor_id: string, assignees: string[], actor_kind?: string): Promise<boolean>;
}
