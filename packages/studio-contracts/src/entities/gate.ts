import { z } from "zod";
import { GateIdSchema, InstanceIdSchema } from "../ids.js";

export const GateSchema = z.object({
  gate_id: GateIdSchema,
  instance_id: InstanceIdSchema,
  status: z.enum(["pending", "approved", "rejected"]),
  transition_id: z.string(),
  quorum: z.enum(["any", "all", "count"]),
});

export type Gate = z.infer<typeof GateSchema>;
