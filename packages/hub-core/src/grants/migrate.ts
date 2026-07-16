import type { Capability } from "@murrmure/contracts";

const VALID_CAPABILITIES: Capability[] = [
  "space:read",
  "space:write",
  "space:enter",
  "flow:read",
  "flow:run",
  "event:emit",
  "step:resolve",
  "journal:read",
  "executor:poll",
  "hub:admin",
];

/** v1 PLATFORM_SCOPES → v2 capabilities (grants-migration.md). */
const V1_SCOPE_TO_CAPABILITIES: Record<string, Capability[]> = {
  "space:read": ["space:read"],
  "space:enter": ["space:enter"],
  "space:admin": ["hub:admin", "space:read", "space:write", "space:enter"],
  "state:transition": ["flow:run"],
  "event:read": ["journal:read"],
  "event:emit": ["event:emit"],
  "flow:install": ["space:write", "flow:read"],
  "flow:configure": ["space:write", "flow:read"],
  "trigger:register": ["space:write"],
  "blob:read": ["space:read"],
  "blob:write": ["space:write"],
  "federation:emit": ["event:emit"],
};

export function mapV1ScopesToCapabilities(scopes: string[]): Capability[] {
  const out = new Set<Capability>();
  for (const scope of scopes) {
    const mapped = V1_SCOPE_TO_CAPABILITIES[scope];
    if (mapped) {
      for (const cap of mapped) out.add(cap);
      continue;
    }
    if (VALID_CAPABILITIES.includes(scope as Capability)) {
      out.add(scope as Capability);
    }
  }
  return [...out];
}

/** Partition legacy grant `scopes[]` into recognized entries (valid v1 scopes
 *  or current capabilities) and unknown/removed entries. Capabilities removed
 *  in the step-contract cutover are no longer members of VALID_CAPABILITIES
 *  and are not v1 scope keys, so they land in `invalid`; without this check
 *  they could be persisted unchanged through the legacy `scopes` field,
 *  bypassing the `capabilities[]` validation on the grant-mint routes
 *  (`mapV1ScopesToCapabilities` silently drops unknown scopes, so the bad value
 *  would otherwise survive in the stored `scopes` column). Callers must reject
 *  `invalid` before persisting. */
export function partitionScopes(scopes: unknown[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const scope of scopes) {
    if (
      typeof scope === "string" &&
      (scope in V1_SCOPE_TO_CAPABILITIES || VALID_CAPABILITIES.includes(scope as Capability))
    ) {
      valid.push(scope);
    } else {
      invalid.push(typeof scope === "string" ? scope : String(scope));
    }
  }
  return { valid, invalid };
}

export function resolveEffectiveCapabilities(input: {
  scopes: string[];
  capabilities?: Capability[];
}): Capability[] {
  if (input.capabilities?.length) {
    return [...new Set(input.capabilities)];
  }
  return mapV1ScopesToCapabilities(input.scopes);
}

export function hasCapability(
  effective: Capability[],
  required: Capability | Capability[],
): boolean {
  const requiredList = Array.isArray(required) ? required : [required];
  if (effective.includes("hub:admin")) return true;
  return requiredList.some((cap) => effective.includes(cap));
}

/** Conformance: grant without flow:run cannot start flow. */
export function canStartFlow(capabilities: Capability[]): boolean {
  return hasCapability(capabilities, "flow:run");
}

/** Conformance: gate approval / run cancel require flow:run on the run. */
export function canResolveGate(capabilities: Capability[]): boolean {
  return hasCapability(capabilities, "flow:run");
}
