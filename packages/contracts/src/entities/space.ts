import { z } from "zod";
import { SpaceIdSchema } from "../ids.js";

export const InstallPolicySchema = z.enum(["human_only", "authorized_agents", "allow_list"]);
export const PreviewPolicySchema = z.enum(["same_origin_only", "allowlist"]);

export const QueryPolicySchema = z.object({
  inbound_allowlist: z.array(z.string()).optional(),
  outbound_allowlist: z.array(z.string()).optional(),
  forbidden_topics: z.array(z.string()).optional(),
});

/** `space.yaml` / MCP `bank` id — memory-hub-slice-1 §4. */
export const MEMORY_BANK_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const MemoryBankIdSchema = z.string().regex(MEMORY_BANK_ID_RE);

/** Engine tag bounds (`memory/src/core/tags.ts`). */
export const MEMORY_TAG_MAX_LENGTH = 128;
export const MEMORY_TAGS_MAX = 64;
export const MemoryTagSchema = z.string().trim().min(1).max(MEMORY_TAG_MAX_LENGTH);
export const MemoryTagsSchema = z.array(MemoryTagSchema).max(MEMORY_TAGS_MAX);

/**
 * Space-relative handbook path. No `..`, no absolute, must be a yaml file.
 * Default install: `skills/memory-use/subjects.yaml`.
 */
export const MEMORY_SUBJECTS_PATH_MAX = 256;
export const MemorySubjectsPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(MEMORY_SUBJECTS_PATH_MAX)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((part) => part === "" || part === "." || part === "..") &&
      /\.ya?ml$/i.test(value),
    "memory_subjects must be a space-relative yaml path with no ..",
  );

/** Inbound memory grant persisted per space. Omitted `tags` = all scopes. */
export const MemoryInboundGrantSchema = z.object({
  bank: MemoryBankIdSchema,
  tags: MemoryTagsSchema.optional(),
});
export type MemoryInboundGrant = z.infer<typeof MemoryInboundGrantSchema>;

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
    memory_bank: MemoryBankIdSchema.optional(),
    memory_tags: MemoryTagsSchema.optional(),
    memory_subjects: MemorySubjectsPathSchema.optional(),
    query_policy: QueryPolicySchema.optional(),
  })
  .passthrough();

export type Space = z.infer<typeof SpaceSchema>;

/** Max length for authored `space.yaml` purpose / about. */
export const SPACE_YAML_DESCRIPTION_MAX = 500;

export const SpaceYamlLinkSchema = z
  .object({
    space_id: z.string().optional(),
    host: z.string().optional(),
  })
  .passthrough();

/** `.mrmr/space/space.yaml` — directory-owned space identity. */
export const SpaceYamlFileSchema = z
  .object({
    apiVersion: z.literal("murrmure.space/v1").optional(),
    slug: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().max(SPACE_YAML_DESCRIPTION_MAX).optional(),
    memory_bank: MemoryBankIdSchema.optional(),
    memory_tags: MemoryTagsSchema.optional(),
    memory_subjects: MemorySubjectsPathSchema.optional(),
    /** Spaces granted read-only access to this space's `memory_bank`. */
    memory_readers: z.array(SpaceIdSchema).optional(),
    link: SpaceYamlLinkSchema.optional(),
  })
  .passthrough();

export type SpaceYamlFile = z.infer<typeof SpaceYamlFileSchema>;
