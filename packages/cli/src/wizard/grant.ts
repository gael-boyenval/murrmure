import type { HubAuth } from "../auth.js";
import { hubFetch, mapHubDenial } from "../lib/hub-request.js";
import { buildMcpConfigSnippet } from "../lib/space-doctor-mcp.js";
import { AGENT_GRANT_CAPABILITIES } from "./capabilities.js";
import { WizardHubError } from "./space-ops.js";

export interface WizardGrantResult {
  grant_id?: string;
  label: string;
  token?: string;
  capabilities: readonly string[];
  mcp_snippet: string;
}

export async function wizardMintAgentGrant(
  auth: HubAuth,
  spaceId: string,
  options?: { label?: string; harness?: string },
): Promise<WizardGrantResult> {
  const label = options?.label ?? "Cursor agent";
  const harness = options?.harness ?? "cursor-local";

  const res = await hubFetch(auth, `/v1/spaces/${spaceId}/grants`, {
    method: "POST",
    json: {
      label,
      harness,
      scopes: [...AGENT_GRANT_CAPABILITIES],
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const denial = mapHubDenial(res.status, body);
    throw new WizardHubError(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
  }

  const token = typeof body.token === "string" ? body.token : undefined;
  const grant_id = typeof body.grant_id === "string" ? body.grant_id : undefined;

  return {
    grant_id,
    label,
    token,
    capabilities: AGENT_GRANT_CAPABILITIES,
    mcp_snippet: buildMcpConfigSnippet({ token }),
  };
}
