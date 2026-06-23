import { z } from "zod";
import { SpaceIdSchema } from "../ids.js";

export const InstallPolicySchema = z.enum(["human_only", "authorized_agents", "allow_list"]);
export const PreviewPolicySchema = z.enum(["same_origin_only", "allowlist"]);

export const QueryPolicySchema = z.object({
  inbound_allowlist: z.array(z.string()).optional(),
  outbound_allowlist: z.array(z.string()).optional(),
  forbidden_topics: z.array(z.string()).optional(),
});

export const SpaceSchema = z
  .object({
    space_id: SpaceIdSchema,
    slug: z.string(),
    name: z.string().optional(),
    status: z.enum(["active", "archived"]),
    parent_space_id: SpaceIdSchema.optional(),
    install_policy: InstallPolicySchema.optional(),
    preview_policy: PreviewPolicySchema.optional(),
    description: z.string().optional(),
    query_policy: QueryPolicySchema.optional(),
  })
  .passthrough();

export type Space = z.infer<typeof SpaceSchema>;
