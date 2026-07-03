import type { ActionSpec } from "../types/reaction-spec.js";
import type { JournalEntry } from "../types/journal-entry.js";

/** Kernel reaction side-effect port (v0.9 journal fanout). */
export interface ReactionActionPort {
  invoke(
    action: ActionSpec,
    ctx: { entry: JournalEntry; reaction_id: string; attempt_no: number },
  ): Promise<{ outcome: "success" | "failure"; detail?: Record<string, unknown> }>;
}

/** @deprecated Use ReactionActionPort for kernel reactions; v2 indexed lookup uses ActionPort. */
export type KernelActionPort = ReactionActionPort;
