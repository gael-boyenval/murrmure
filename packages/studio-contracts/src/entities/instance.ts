import { z } from "zod";
import { InstanceIdSchema, SpaceIdSchema } from "../ids.js";

export const InstanceSchema = z.object({
  instance_id: InstanceIdSchema,
  space_id: SpaceIdSchema,
  contract_ref_id: z.string(),
  state: z.string(),
  revision: z.number(),
  metadata: z.record(z.unknown()),
});

export type Instance = z.infer<typeof InstanceSchema>;
