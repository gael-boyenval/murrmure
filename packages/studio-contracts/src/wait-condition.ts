import { z } from "zod";
import { GateIdSchema } from "./ids.js";

const baseCondition = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("state"),
    state: z.string(),
    op: z.enum(["eq", "in"]).optional(),
  }),
  z.object({
    type: z.literal("gate"),
    gate_id: GateIdSchema.optional(),
    resolution: z.enum(["approved", "rejected"]).optional(),
  }),
  z.object({
    type: z.literal("event"),
    event_type: z.string(),
    match: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("contract"),
    capability_id: z.string(),
    min_version: z.string().optional(),
  }),
]);

type WaitCondition =
  | z.infer<typeof baseCondition>
  | { type: "compound"; all_of?: WaitCondition[]; any_of?: WaitCondition[] };

export const WaitConditionSchema: z.ZodType<WaitCondition> = z.lazy(() =>
  z.union([
    baseCondition,
    z.object({
      type: z.literal("compound"),
      all_of: z.array(WaitConditionSchema).optional(),
      any_of: z.array(WaitConditionSchema).optional(),
    }),
  ]),
);

export type { WaitCondition };
