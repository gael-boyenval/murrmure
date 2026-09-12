import type { Capability, PersonaAd } from "@murrmure/contracts";
import type { GrantRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { hasCapability, resolveEffectiveCapabilities } from "../grants/migrate.js";

export type InvitablePersonaAd = {
  id: string;
  summary: string;
  asks: string[];
  requests: string[];
};

export type InvitableSpace = {
  space_id: string;
  slug: string;
  name: string;
  personas: InvitablePersonaAd[];
};

export type ListInvitableSpacesInput = {
  token_space_id: string;
  actor_id: string;
  harness_id?: string;
  capabilities: Capability[];
};

function grantIsCurrent(grant: GrantRow, nowMs: number): boolean {
  if (grant.status !== "active") return false;
  if (!grant.expires_at) return true;
  const expiry = Date.parse(grant.expires_at);
  return !Number.isFinite(expiry) || expiry > nowMs;
}

function grantHarnessMatches(grant: GrantRow, harnessId?: string): boolean {
  return (grant.harness ?? undefined) === (harnessId ?? undefined);
}

function grantHasSpaceRead(grant: GrantRow): boolean {
  return hasCapability(
    resolveEffectiveCapabilities({
      scopes: grant.scopes,
      capabilities: grant.capabilities,
    }),
    "space:read",
  );
}

export function toInvitablePersonaAd(row: PersonaAd): InvitablePersonaAd {
  return {
    id: row.id,
    summary: row.summary,
    asks: row.asks ?? [],
    requests: row.requests ?? [],
  };
}

export async function listInvitableSpaces(
  studio: StudioPersistencePort,
  input: ListInvitableSpacesInput,
): Promise<InvitableSpace[]> {
  const all = await studio.listSpaces();
  const privileged =
    input.token_space_id === "bootstrap" || hasCapability(input.capabilities, "hub:admin");

  let visible = all;
  if (!privileged) {
    const ownBare = stripSpaceId(input.token_space_id);
    const granted = new Set<string>(ownBare ? [ownBare] : []);
    const nowMs = Date.now();
    for (const grant of await studio.listAllGrants()) {
      if (!grantIsCurrent(grant, nowMs)) continue;
      if (grant.actor_id !== input.actor_id) continue;
      if (!grantHarnessMatches(grant, input.harness_id)) continue;
      if (!grantHasSpaceRead(grant)) continue;
      granted.add(stripSpaceId(grant.space_id));
    }
    visible = all.filter((space) => granted.has(stripSpaceId(space.space_id)));
  }

  const out: InvitableSpace[] = [];
  for (const space of visible) {
    const bare = stripSpaceId(space.space_id);
    const personas = await studio.listIndexedPersonas(bare);
    out.push({
      space_id: addSpaceId(bare),
      slug: space.slug,
      name: space.name ?? space.slug,
      personas: personas.map(toInvitablePersonaAd),
    });
  }

  out.sort((a, b) => a.slug.localeCompare(b.slug) || a.space_id.localeCompare(b.space_id));
  return out;
}
