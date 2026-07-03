import { z } from "zod";

export const MemberRoleSchema = z.enum(["admin", "editor", "viewer"]);

export const MemberSchema = z.object({
  member_id: z.string(),
  space_id: z.string(),
  email: z.string(),
  role: MemberRoleSchema,
  actor_id: z.string().optional(),
});

export type Member = z.infer<typeof MemberSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
