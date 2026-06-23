import type { ActionSpec } from "../types/reaction-spec.js";
import type { JournalEntry } from "../types/journal-entry.js";

export interface ActionPort {
  invoke(
    action: ActionSpec,
    ctx: { entry: JournalEntry; reaction_id: string; attempt_no: number },
  ): Promise<{ outcome: "success" | "failure"; detail?: Record<string, unknown> }>;
}
