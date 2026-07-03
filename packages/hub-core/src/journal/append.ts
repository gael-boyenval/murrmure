import { deriveJournalSubject } from "@murrmure/contracts";
import { assertInlinePayloadWithinLimit } from "@murrmure/contracts";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";

export class InlinePayloadExceededError extends Error {
  readonly code = "INLINE_PAYLOAD_EXCEEDED";
  readonly maxBytes: number;
  readonly actualBytes: number;

  constructor(maxBytes: number, actualBytes: number) {
    super(`Inline payload exceeds ${maxBytes} bytes (${actualBytes} bytes); use PUT /v1/artifacts`);
    this.name = "InlinePayloadExceededError";
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

export interface SpaceJournalEnvelopeInput {
  space_id: string;
  type: string;
  actor_id: string;
  session_id?: string;
  run_id?: string;
  data: Record<string, unknown>;
  eventId: string;
  ts: string;
}

/** Build the CloudEvents-shaped journal payload persisted by the hub. */
export function buildSpaceJournalEnvelope(input: SpaceJournalEnvelopeInput): Record<string, unknown> {
  const bare = stripSpaceId(input.space_id);
  const subject = deriveJournalSubject({ session_id: input.session_id, run_id: input.run_id });
  const payload: Record<string, unknown> = {
    ...input.data,
    specversion: "1.0",
    id: input.eventId,
    source: `/spaces/${addSpaceId(bare)}`,
    type: input.type,
    time: input.ts,
    datacontenttype: "application/json",
    space_id: addSpaceId(bare),
    session_id: input.session_id,
    run_id: input.run_id,
    actor_id: input.actor_id,
  };
  if (subject) payload.subject = subject;
  return payload;
}

/** Enforce rev-1 §7.1 inline cap on the serialized journal envelope before append. */
export function validateJournalInlinePayload(payload: Record<string, unknown>): void {
  try {
    assertInlinePayloadWithinLimit(payload);
  } catch (error) {
    if (error instanceof Error && /exceeds \d+ bytes/.test(error.message)) {
      const match = error.message.match(/\((\d+) bytes\)/);
      const actual = match ? Number(match[1]) : 0;
      throw new InlinePayloadExceededError(65_536, actual);
    }
    throw error;
  }
}
