import { z } from "zod";

/** rev-1 §9.1 single capability model (replaces v1 PLATFORM_SCOPES ladder). */
export const CAPABILITY_STRINGS = [
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
] as const;

export const CapabilitySchema = z.enum(CAPABILITY_STRINGS);

export type Capability = z.infer<typeof CapabilitySchema>;

/** Valid capability set; used to reject unknown/removed capabilities at grant
 *  boundaries. Capabilities removed in the step-contract cutover are not
 *  members and must be rejected rather than persisted unchanged. */
export const VALID_CAPABILITIES: ReadonlySet<Capability> = new Set(CAPABILITY_STRINGS);

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && VALID_CAPABILITIES.has(value as Capability);
}

/** Partition a list into valid capabilities and unknown/removed entries.
 *  Grant routes and mintGrant use this to reject removed capabilities with a
 *  clear error instead of persisting them unchanged. */
export function partitionCapabilities(values: unknown[]): {
  valid: Capability[];
  invalid: string[];
} {
  const valid: Capability[] = [];
  const invalid: string[] = [];
  for (const value of values) {
    if (isCapability(value)) {
      valid.push(value);
    } else {
      invalid.push(typeof value === "string" ? value : String(value));
    }
  }
  return { valid, invalid };
}
