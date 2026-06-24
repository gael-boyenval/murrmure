import { readCredentials } from "./auth-store.js";
import type { GlobalFlags } from "./flags.js";
import { printErr } from "./output.js";

export type SpaceIdResult = { spaceId: string } | { error: "MISSING_SPACE"; message: string };

export function resolveSpaceId(
  flags: GlobalFlags,
  positionalSpaceId?: string,
): SpaceIdResult {
  if (positionalSpaceId) return { spaceId: positionalSpaceId };
  if (flags.space) return { spaceId: flags.space };
  if (process.env.MURRMURE_SPACE_ID) return { spaceId: process.env.MURRMURE_SPACE_ID };

  const credentials = readCredentials();
  if (credentials?.defaultSpaceId) return { spaceId: credentials.defaultSpaceId };

  return {
    error: "MISSING_SPACE",
    message:
      "Missing space — pass --space, set MURRMURE_SPACE_ID, or configure defaultSpaceId via mrmr login",
  };
}

export function assertSpaceId(flags: GlobalFlags, positionalSpaceId?: string): string {
  const result = resolveSpaceId(flags, positionalSpaceId);
  if ("error" in result) {
    printErr("MISSING_SPACE", result.message, {
      tip: "Pass --space <spc_id> or export MURRMURE_SPACE_ID",
    });
  }
  return result.spaceId;
}
