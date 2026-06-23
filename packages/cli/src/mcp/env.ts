/** Resolve MCP env vars — canonical names are MURRMURE_HUB_URL / MURRMURE_HUB_TOKEN. */
export function readHubUrl(): string {
  return (
    process.env.MURRMURE_HUB_URL ??
    process.env.MURRMURE_API_URL ??
    "http://127.0.0.1:8787"
  );
}

export function readHubToken(): string {
  return (
    process.env.MURRMURE_HUB_TOKEN ??
    process.env.MURRMURE_API_TOKEN ??
    process.env.MURRMURE_TOKEN ??
    ""
  );
}

export function readSpaceId(): string {
  return process.env.MURRMURE_SPACE_ID ?? "";
}
