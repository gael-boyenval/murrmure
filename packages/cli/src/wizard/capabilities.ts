/** Named least-privilege profile used for local Tutorial v3 connections. */
export const TUTORIAL_BUILDER_PROFILE = {
  name: "tutorial-builder",
  version: 1,
  id: "tutorial-builder/v1",
} as const;

export const TUTORIAL_BUILDER_CAPABILITIES = [
  "space:read",
  "flow:read",
  "flow:run",
  "step:resolve",
] as const;

/** @deprecated Internal compatibility export; public setup uses connection vocabulary. */
export const AGENT_GRANT_CAPABILITIES = TUTORIAL_BUILDER_CAPABILITIES;
export const AGENT_GRANT_CAPABILITIES_CSV = TUTORIAL_BUILDER_CAPABILITIES.join(",");
