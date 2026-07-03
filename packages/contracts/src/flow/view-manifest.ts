import { z } from "zod";

/** Client view package manifest — parsed at apply, denormalized to flow index only. */
export const ViewManifestSchema = z.object({
  apiVersion: z.literal("murrmure.view/v1"),
  id: z.string(),
  entry: z.string().optional(),
  shell_route: z.string().optional(),
  params_schema: z.string().optional(),
});

export type ViewManifest = z.infer<typeof ViewManifestSchema>;
