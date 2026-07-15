import type { Provenance } from "./provenance.js";
import type { RuleRef } from "./rule-ref.js";
import type { WaitCondition } from "./wait-condition.js";

export type KernelCommand =
  | {
      kind: "aggregate.create";
      provenance: Provenance;
      rule_ref: RuleRef;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: "state.transition";
      provenance: Provenance;
      aggregate_id: string;
      event: string;
      payload?: Record<string, unknown>;
      expected_revision: number;
      block_on?: WaitCondition;
    }
  | {
      kind: "event.append";
      provenance: Provenance;
      aggregate_id: string;
      event_type: string;
      payload?: Record<string, unknown>;
    }
  | {
      kind: "wait.register";
      provenance: Provenance;
      condition: WaitCondition;
      delivery_mode: "in_process";
      bound_command_id?: string;
      aggregate_id?: string;
    }
  | { kind: "wait.cancel"; provenance: Provenance; wait_id: string }
  | {
      kind: "reaction.register";
      provenance: Provenance;
      spec: import("./reaction-spec.js").ReactionSpecInput;
    }
  | { kind: "reaction.disable"; provenance: Provenance; reaction_id: string }
  | {
      kind: "reaction.replay";
      provenance: Provenance;
      reaction_id: string;
      source_entry_id: string;
      bypass_dedup?: boolean;
      reason: string;
    };
