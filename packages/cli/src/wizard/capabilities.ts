/** Rev-1 agent grant capabilities for setup/onboard wizards (replaces v1 WORKER_SCOPES). */
export const AGENT_GRANT_CAPABILITIES = [
  "space:read",
  "flow:run",
  "flow:read",
  "action:invoke",
  "gate:resolve",
  "journal:read",
] as const;

export const AGENT_GRANT_CAPABILITIES_CSV = AGENT_GRANT_CAPABILITIES.join(",");
