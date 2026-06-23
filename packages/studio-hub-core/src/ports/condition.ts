import type { ConditionPort } from "@runtime/contracts";

export function createCelConditionPort(): ConditionPort {
  return {
    evaluate: async () => true,
    matchActor: async (_id, patterns) =>
      patterns.includes("*") || patterns.some((p) => p.endsWith(":*")),
    matchAssignee: async (_actor_id, assignees, actor_kind) => {
      for (const p of assignees) {
        if (p === "*") return true;
        if (p === "human:*" && actor_kind === "human") return true;
        if (p === "agent:*" && actor_kind === "agent") return true;
      }
      return false;
    },
  };
}
