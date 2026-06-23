import { z } from "zod";
import { GrantIdSchema, SpaceIdSchema } from "../ids.js";

export const PLATFORM_SCOPES = [
  "space:enter",
  "space:read",
  "event:read",
  "event:emit",
  "state:transition",
  "blob:read",
  "blob:write",
  "capability:install",
  "trigger:register",
  "federation:emit",
  "space:admin",
] as const;

export const GrantSchema = z.object({
  grant_id: GrantIdSchema,
  space_id: SpaceIdSchema,
  actor_id: z.string(),
  scopes: z.array(z.enum(PLATFORM_SCOPES)),
  status: z.enum(["active", "revoked"]),
});

export type Grant = z.infer<typeof GrantSchema>;
