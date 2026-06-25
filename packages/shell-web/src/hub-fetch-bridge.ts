const ALLOWED_HUB_FETCH_HEADERS = new Set([
  "accept",
  "content-type",
  "idempotency-key",
]);

const BLOCKED_HUB_FETCH_HEADERS = new Set([
  "authorization",
  "x-murrmure-internal-space",
  "x-murrmure-caller-token",
  "x-murrmure-worker-token",
]);

export function filterHubFetchHeaders(
  headers?: Record<string, string>,
): Record<string, string> {
  if (!headers) {
    return {};
  }
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (BLOCKED_HUB_FETCH_HEADERS.has(lower)) {
      continue;
    }
    if (ALLOWED_HUB_FETCH_HEADERS.has(lower)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function isAllowedHubFetchPath(
  hubUrl: string,
  packageId: string,
  path: string,
): { ok: true; target: URL } | { ok: false; error: string } {
  const apiPrefix = `/api/${packageId}/`;
  let target: URL;
  try {
    target = new URL(path, `${hubUrl}/`);
  } catch {
    return { ok: false, error: "Invalid hub-fetch path" };
  }
  if (target.origin !== hubUrl || !target.pathname.startsWith(apiPrefix)) {
    return { ok: false, error: "hub-fetch path blocked" };
  }
  return { ok: true, target };
}
