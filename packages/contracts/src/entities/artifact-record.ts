import { z } from "zod";
import { TransferIdSchema } from "../ids.js";

const WireSpaceIdSchema = z.string().regex(/^spc_/, "Expected spc_ prefixed space id");

export const ArtifactPutBodySchema = z.object({
  space_id: WireSpaceIdSchema,
  name: z.string().min(1),
  /** Base64-encoded artifact bytes. */
  content_base64: z.string().min(1),
  authorized_readers: z.array(z.string()).min(1),
  hold: z.boolean().optional(),
  ttl_days: z.number().int().positive().optional(),
  /** Idempotent re-registration when client already minted transfer_id. */
  transfer_id: TransferIdSchema.optional(),
});

export const ArtifactMaterializeBodySchema = z.object({
  space_id: WireSpaceIdSchema,
});

export type ArtifactPutBody = z.infer<typeof ArtifactPutBodySchema>;
export type ArtifactMaterializeBody = z.infer<typeof ArtifactMaterializeBodySchema>;
