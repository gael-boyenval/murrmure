/** Hub restarted: in-memory control seq is behind the client's last ack. */
export function handshakeSeqReset(lastAckSeq: number, handshakeAckSeq: number): boolean {
  return Number.isFinite(handshakeAckSeq) && handshakeAckSeq > 0 && lastAckSeq > handshakeAckSeq;
}

/** Desktop HMR / hub replace: discovery pid or started_at changed. */
export function hubInstanceChanged(previous: string | null, current: string | null): boolean {
  return Boolean(previous && current && previous !== current);
}

export function hubInstanceKey(
  instance: { pid?: number; started_at?: string } | null,
): string | null {
  if (!instance) return null;
  if (instance.pid == null && !instance.started_at) return null;
  return `${instance.pid ?? ""}:${instance.started_at ?? ""}`;
}

/**
 * True when the hub catalog names differ from the cached list (order-insensitive).
 * Empty/missing `server_tools` is "unknown" — old stubs must not look like a wipe.
 */
export function hubToolNamesChanged(
  cached: ReadonlyArray<{ name: string }>,
  remote: string[] | undefined,
): boolean {
  if (!remote || remote.length === 0) return false;
  if (cached.length !== remote.length) return true;
  const local = cached.map((tool) => tool.name).sort();
  const expected = [...remote].sort();
  return local.some((name, index) => name !== expected[index]);
}
