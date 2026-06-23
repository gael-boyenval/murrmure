import type { ActorKind } from "./primitives.js";

export interface Provenance {
  scope_id: string;
  actor_id: string;
  credential_id: string;
  aggregate_id?: string;
  command_id?: string;
  actor_kind?: ActorKind;
}
