/** Resolve MCP env vars — canonical names are STUDIO_HUB_URL / STUDIO_HUB_TOKEN. */
export function readHubUrl(): string {
  return (
    process.env.STUDIO_HUB_URL ??
    process.env.STUDIO_API_URL ??
    "http://127.0.0.1:8787"
  );
}

export function readHubToken(): string {
  return (
    process.env.STUDIO_HUB_TOKEN ??
    process.env.STUDIO_API_TOKEN ??
    process.env.STUDIO_TOKEN ??
    ""
  );
}

export function readSpaceId(): string {
  return process.env.STUDIO_SPACE_ID ?? "";
}
