import { z } from "zod";
import { InstanceIdSchema, SpaceIdSchema, TokenIdSchema } from "../ids.js";

export const ProvenanceSchema = z.object({
  space_id: SpaceIdSchema,
  instance_id: InstanceIdSchema.optional(),
  actor_id: z.string(),
  token_id: TokenIdSchema,
  command_id: z.string().optional(),
});

export type StudioProvenance = z.infer<typeof ProvenanceSchema>;
