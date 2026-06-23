import type { RuleArtifact } from "@murrmure/runtime-contracts";
import type { ContractV2 } from "@murrmure/contracts";

function isStandardGate(
  gate: unknown,
): gate is { mode: "any" | "all" | "count"; count?: number; assignees: string[] } {
  return (
    gate != null &&
    typeof gate === "object" &&
    "mode" in gate &&
    "assignees" in gate &&
    Array.isArray((gate as { assignees: unknown }).assignees)
  );
}

export function contractV2ToRuleArtifact(contract: ContractV2): RuleArtifact {
  return {
    schema_version: "1.0",
    id: contract.id,
    version: contract.version,
    initial_state: contract.initial_state,
    terminal_states: contract.terminal_states,
    metadata_schema: contract.metadata_schema,
    states: contract.states.map((s) => ({
      id: s.id,
      kind: s.kind ?? "active",
    })),
    transitions: contract.transitions.map((t) => ({
      id: t.id,
      from: t.from ?? contract.initial_state,
      to: t.to,
      event: t.event,
      actors: t.actors,
      condition: t.condition,
      checkpoint: isStandardGate(t.gate)
        ? {
            quorum: t.gate.mode,
            count: t.gate.count ?? (t.gate.mode === "any" ? 1 : t.gate.count ?? 1),
            assignees: t.gate.assignees,
          }
        : null,
      emit: t.emit ?? [],
    })),
    events: contract.events
      ? {
          declarations: contract.events.declarations.map((d) => ({
            type: d.type,
            schema: d.schema ?? d.payload_schema ?? { type: "object" },
          })),
        }
      : undefined,
  };
}
