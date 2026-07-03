import { z } from "zod";
import { FlowManifestSchema } from "./manifest.js";

export const FlowAttachPayloadSchema = z.object({
  kind: z.literal("murrmure.flow.attach/v1"),
  manifest: FlowManifestSchema,
});

export type FlowAttachPayload = z.infer<typeof FlowAttachPayloadSchema>;
