import type { HubAuth } from "../auth.js";
import { hubFetch as authHubFetch } from "../auth.js";

export type HubRequestInit = RequestInit & { json?: unknown };

export type HubDenial = {
  code: string;
  message: string;
  hint?: unknown;
};

export async function hubFetch(
  auth: HubAuth,
  path: string,
  init?: HubRequestInit,
): Promise<Response> {
  return authHubFetch(auth, path, init);
}

export async function hubJson<T = unknown>(
  auth: HubAuth,
  path: string,
  init?: HubRequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: unknown }> {
  const res = await hubFetch(auth, path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, body };
  return { ok: true, data: body as T };
}

const TOKEN_DENIED_CODES = new Set(["token_denied", "TOKEN_DENIED"]);

export function mapWhoamiAuthError(
  status: number,
  body: unknown,
): { code: string; message: string; hint?: unknown } {
  if (status === 401) {
    const message =
      body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "Invalid token";
    return { code: "AUTH_INVALID", message };
  }

  const denial = mapHubDenial(status, body);
  const code = TOKEN_DENIED_CODES.has(denial.code) ? "AUTH_INVALID" : denial.code;
  return denial.hint !== undefined
    ? { code, message: denial.message, hint: denial.hint }
    : { code, message: denial.message };
}

export function mapHubDenial(status: number, body: unknown): HubDenial {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : status === 403 ? "HUB_FORBIDDEN" : "HUB_ERROR";
    const message =
      typeof record.message === "string"
        ? record.message
        : status === 403
          ? "Access denied by hub"
          : `Hub request failed with status ${status}`;
    const hint = record.hint;
    return hint !== undefined ? { code, message, hint } : { code, message };
  }

  if (status === 403) return { code: "HUB_FORBIDDEN", message: "Access denied by hub" };
  return { code: "HUB_ERROR", message: `Hub request failed with status ${status}` };
}
