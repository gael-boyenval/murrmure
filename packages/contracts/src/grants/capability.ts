import { z } from "zod";

/** rev-1 §9.1 single capability model (replaces v1 PLATFORM_SCOPES ladder). */
export const CAPABILITY_STRINGS = [
  "space:read",
  "space:write",
  "space:enter",
  "flow:read",
  "flow:run",
  "action:invoke",
  "gate:resolve",
  "step:resolve",
  "journal:read",
  "executor:poll",
  "hub:admin",
] as const;

export const CapabilitySchema = z.enum(CAPABILITY_STRINGS);

export type Capability = z.infer<typeof CapabilitySchema>;
