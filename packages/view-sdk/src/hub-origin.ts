const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/** Hub token URL origin (shell parent in production). */
export function resolveHubOrigin(hubBaseUrl: string): string {
  return new URL(hubBaseUrl).origin;
}

/**
 * Whether an event origin matches a hub base URL, treating localhost and 127.0.0.1
 * as equivalent — consistent with shell-web LOCAL_HUB_URLS loopback aliases.
 */
export function hubOriginsMatch(origin: string, hubBaseUrl: string): boolean {
  try {
    const a = new URL(origin);
    const b = new URL(hubBaseUrl);
    if (a.origin === b.origin) return true;
    if (
      a.protocol === b.protocol &&
      a.port === b.port &&
      isLoopbackHostname(a.hostname) &&
      isLoopbackHostname(b.hostname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
