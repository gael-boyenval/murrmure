import { z } from "zod";

/**
 * Space-level flow/view bindings (VS-5):
 * - local:<relative path under .mrmr/>
 * - space:<space id>
 * - catalog
 */
const BindingSourceSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value === "catalog" ||
      value.startsWith("local:") ||
      value.startsWith("space:"),
    "source must be one of: catalog, local:<path>, space:<space_id>",
  );

export const FlowBindingRefSchema = z.object({
  ref: z.string().min(1),
  source: BindingSourceSchema,
});

export const ViewBindingRefSchema = z.object({
  ref: z.string().min(1),
  source: BindingSourceSchema,
});

export const BindingsFileSchema = z.object({
  version: z.literal(1),
  flows: z.array(FlowBindingRefSchema).default([]),
  views: z.array(ViewBindingRefSchema).default([]),
});

export type FlowBindingRef = z.infer<typeof FlowBindingRefSchema>;
export type ViewBindingRef = z.infer<typeof ViewBindingRefSchema>;
export type BindingsFile = z.infer<typeof BindingsFileSchema>;
