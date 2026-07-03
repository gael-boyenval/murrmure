import { z } from "zod";
import { TransferIdSchema } from "../ids.js";

export const ArtifactV1Schema = z.object({
  kind: z.literal("mrmr.artifact/v1"),
  transfer_id: TransferIdSchema,
  digest: z.string(),
  name: z.string(),
  size_bytes: z.number().int().nonnegative(),
  local_path: z.string().optional(),
  authorized_readers: z.array(z.string()),
  hold: z.boolean().optional(),
});

export const ArtifactEnvelopeSchema = z.object({
  artifact: ArtifactV1Schema,
});

export type ArtifactV1 = z.infer<typeof ArtifactV1Schema>;
export type ArtifactEnvelope = z.infer<typeof ArtifactEnvelopeSchema>;
