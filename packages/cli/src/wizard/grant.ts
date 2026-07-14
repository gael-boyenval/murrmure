import type { HubAuth } from "../auth.js";
import { hubFetch, mapHubDenial } from "../lib/hub-request.js";
import {
  buildConnectionDescriptor,
  type ConnectionDescriptor,
} from "../lib/connection-adapters.js";
import { storeConnectionToken, writeActiveConnection } from "../lib/connection-store.js";
import {
  TUTORIAL_BUILDER_CAPABILITIES,
  TUTORIAL_BUILDER_PROFILE,
} from "./capabilities.js";
import { WizardHubError } from "./space-ops.js";

export interface WizardConnectionResult {
  connection_id: string;
  label: string;
  capabilities: readonly string[];
  profile: typeof TUTORIAL_BUILDER_PROFILE.id;
  descriptor: ConnectionDescriptor;
}

function publicConnectionId(grantId: string): string {
  return grantId.replace(/^grt_/, "con_");
}

export async function wizardCreateConnection(
  auth: HubAuth,
  spaceId: string,
  options?: {
    label?: string;
    harness?: string;
    storeCredential?: (hubId: string, connectionId: string, token: string) => void;
    activate?: typeof writeActiveConnection;
  },
): Promise<WizardConnectionResult> {
  const label = options?.label ?? "Local tools";
  const harness = options?.harness ?? "local-tools";

  const res = await hubFetch(auth, `/v1/spaces/${spaceId}/grants`, {
    method: "POST",
    json: {
      label,
      harness,
      scopes: [...TUTORIAL_BUILDER_CAPABILITIES],
      profile: TUTORIAL_BUILDER_PROFILE.id,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const denial = mapHubDenial(res.status, body);
    throw new WizardHubError(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
  }

  const token = typeof body.token === "string" ? body.token : undefined;
  const grant_id = typeof body.grant_id === "string" ? body.grant_id : undefined;
  if (!token || !grant_id) {
    throw new WizardHubError(
      "CONNECTION_CREATE_FAILED",
      "Hub did not return a complete connection credential.",
    );
  }
  const connection_id = publicConnectionId(grant_id);
  (options?.storeCredential ?? storeConnectionToken)(auth.hubUrl, connection_id, token);
  (options?.activate ?? writeActiveConnection)({
    hub_id: auth.hubUrl,
    connection_id,
    space_id: spaceId,
    profile: TUTORIAL_BUILDER_PROFILE.id,
  });
  const descriptor = buildConnectionDescriptor({
    hubId: auth.hubUrl,
    connectionId: connection_id,
    spaceId,
  });

  return {
    connection_id,
    label,
    capabilities: TUTORIAL_BUILDER_CAPABILITIES,
    profile: TUTORIAL_BUILDER_PROFILE.id,
    descriptor,
  };
}

/** @deprecated Internal test compatibility; public vocabulary is connection. */
export const wizardMintAgentGrant = wizardCreateConnection;
export type WizardGrantResult = WizardConnectionResult;
