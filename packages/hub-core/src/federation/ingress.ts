import type { FederationIngressEnvelope } from "./port.js";

export interface FederationIngressDeps {
  hasDedup(source_hub_id: string, event_id: string): Promise<boolean>;
  recordDedup(source_hub_id: string, event_id: string, at: string): Promise<void>;
  appendJournal?(input: {
    space_id: string;
    type: string;
    payload: Record<string, unknown>;
    federation: FederationIngressEnvelope["federation"];
  }): Promise<void>;
}

export interface IngressResult {
  accepted: boolean;
  duplicate?: boolean;
  reason?: string;
}

/** Validate + dedup incoming federation journal/events on (source_hub_id, event_id). */
export async function ingestFederationEvent(
  deps: FederationIngressDeps,
  envelope: FederationIngressEnvelope,
  clock: { nowIso(): string },
): Promise<IngressResult> {
  if (!envelope.source_hub_id || !envelope.event_id) {
    return { accepted: false, reason: "INVALID_ENVELOPE" };
  }
  if (!envelope.space_id.startsWith("spc_")) {
    return { accepted: false, reason: "INVALID_SPACE_ID" };
  }

  const duplicate = await deps.hasDedup(envelope.source_hub_id, envelope.event_id);
  if (duplicate) {
    return { accepted: true, duplicate: true };
  }

  await deps.recordDedup(envelope.source_hub_id, envelope.event_id, clock.nowIso());

  if (deps.appendJournal) {
    await deps.appendJournal({
      space_id: envelope.space_id,
      type: envelope.event_type,
      payload: envelope.payload,
      federation: {
        origin_hub_id: envelope.source_hub_id,
        origin_seq: envelope.federation?.origin_seq,
        ingress: true,
      },
    });
  }

  return { accepted: true, duplicate: false };
}
