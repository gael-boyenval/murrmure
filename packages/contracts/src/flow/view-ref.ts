import { z } from "zod";
import { SpaceIdSchema } from "../ids.js";

export const FlowViewRefSchema = z.object({
  view_id: z.string(),
  origin_space_id: SpaceIdSchema,
  entry_url: z.string().optional(),
  shell_route: z.string().optional(),
  params_schema: z.string().optional(),
});

export type FlowViewRef = z.infer<typeof FlowViewRefSchema>;
