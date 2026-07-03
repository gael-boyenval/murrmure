import { z } from "zod";
import { InstanceIdSchema, SpaceIdSchema } from "../ids.js";

/** v1 hub instance aggregate — unchanged until phase 05 session/run migration. */
export const V1InstanceSchema = z.object({
  instance_id: InstanceIdSchema,
  space_id: SpaceIdSchema,
  contract_ref_id: z.string(),
  state: z.string(),
  revision: z.number(),
  metadata: z.record(z.unknown()),
});

export type V1Instance = z.infer<typeof V1InstanceSchema>;

/**
 * v1 wire shape used by hub-daemon today.
 * @deprecated Prefer RunSchema for rev-1 session/run model (phase 05+).
 */
export const InstanceSchema = V1InstanceSchema;
export type Instance = V1Instance;
