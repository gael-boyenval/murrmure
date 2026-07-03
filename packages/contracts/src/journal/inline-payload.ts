/** rev-1 §7.1 inline payload cap for journal `data` and invoke bodies. */
export const INLINE_PAYLOAD_MAX_BYTES = 65_536;

export function inlinePayloadByteLength(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload ?? null)).length;
}

export function assertInlinePayloadWithinLimit(
  payload: unknown,
  maxBytes = INLINE_PAYLOAD_MAX_BYTES,
): void {
  const size = inlinePayloadByteLength(payload);
  if (size > maxBytes) {
    throw new Error(`Inline payload exceeds ${maxBytes} bytes (${size} bytes)`);
  }
}

export function isInlinePayloadWithinLimit(
  payload: unknown,
  maxBytes = INLINE_PAYLOAD_MAX_BYTES,
): boolean {
  return inlinePayloadByteLength(payload) <= maxBytes;
}
