import { ulid } from "ulid";

interface SseTicketEntry {
  token_id: string;
  expires_at: number;
}

const tickets = new Map<string, SseTicketEntry>();

const DEFAULT_TTL_MS = 60_000;

export function mintSseTicket(tokenId: string, ttlMs = DEFAULT_TTL_MS): string {
  const ticket = `tkt_${ulid()}`;
  tickets.set(ticket, { token_id: tokenId, expires_at: Date.now() + ttlMs });
  return ticket;
}

export function resolveSseTicket(ticket: string): string | null {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  if (Date.now() > entry.expires_at) {
    tickets.delete(ticket);
    return null;
  }
  return entry.token_id;
}

/** Test helper — clear in-memory tickets. */
export function clearSseTickets(): void {
  tickets.clear();
}
