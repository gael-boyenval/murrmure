import type { WaitCondition as KernelWaitCondition } from "@murrmure/runtime-contracts";
import type { WaitCondition as StudioWaitCondition } from "@murrmure/contracts";
import { stripGateId } from "./ids.js";

export function mapWaitCondition(condition: StudioWaitCondition): KernelWaitCondition {
  switch (condition.type) {
    case "state":
      return { type: "state", state: condition.state };
    case "gate":
      return {
        type: "checkpoint",
        checkpoint_id: condition.gate_id ? stripGateId(condition.gate_id) : undefined,
        resolution: condition.resolution,
      };
    case "event":
      return {
        type: "entry",
        entry_type: condition.event_type,
        match: condition.match,
      };
    case "contract":
      return {
        type: "artifact",
        rule_set_key: condition.capability_id,
        min_version: condition.min_version,
      };
    case "compound":
      return {
        type: "compound",
        all_of: condition.all_of?.map(mapWaitCondition),
        any_of: condition.any_of?.map(mapWaitCondition),
      };
    default:
      throw new Error(`Unknown wait condition type`);
  }
}
