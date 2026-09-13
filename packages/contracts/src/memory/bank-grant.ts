import { z } from "zod";
import { MemoryBankGrantIdSchema, SpaceIdSchema } from "../ids.js";
import { MemoryBankIdSchema } from "../entities/space.js";

export const MemoryBankGrantStatusSchema = z.enum(["active", "revoked"]);
export type MemoryBankGrantStatus = z.infer<typeof MemoryBankGrantStatusSchema>;

/** Persistable Space→bank read grant. Distinct from connection `memory:read`. */
export const MemoryBankGrantSchema = z.object({
  grant_id: MemoryBankGrantIdSchema,
  reader_space_id: SpaceIdSchema,
  target_bank: MemoryBankIdSchema,
  owner_space_id: SpaceIdSchema,
  status: MemoryBankGrantStatusSchema,
  created_at: z.string(),
  revoked_at: z.string().optional(),
});
export type MemoryBankGrant = z.infer<typeof MemoryBankGrantSchema>;

export const MemoryBankOriginSchema = z.enum(["own", "granted"]);
export type MemoryBankOrigin = z.infer<typeof MemoryBankOriginSchema>;

export const MemoryBankListItemSchema = z.object({
  bank: MemoryBankIdSchema,
  origin: MemoryBankOriginSchema,
  owner_space_id: SpaceIdSchema.optional(),
  grant_id: MemoryBankGrantIdSchema.optional(),
});
export type MemoryBankListItem = z.infer<typeof MemoryBankListItemSchema>;

export const MemoryBankListSchema = z.object({
  banks: z.array(MemoryBankListItemSchema),
});
export type MemoryBankList = z.infer<typeof MemoryBankListSchema>;
