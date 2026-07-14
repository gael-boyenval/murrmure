import { z } from "zod";
import { ActionsFileSchema } from "../entities/action.js";
import { ExecutorsFileSchema } from "../entities/executor.js";
import { HandlersFileSchema } from "../entities/handler.js";
import { HooksFileSchema } from "../entities/hook.js";
import { EventsFileSchema } from "../entities/event-declaration.js";
import { BindingsFileSchema } from "../entities/bindings.js";
import { FlowManifestSchema } from "./manifest.js";
import { ViewManifestSchema } from "./view-manifest.js";

const DigestPayloadSchema = z.object({
  digest: z.string(),
});

export const SpaceApplyActionsSchema = DigestPayloadSchema.extend({
  file: ActionsFileSchema,
});

export const SpaceApplyExecutorsSchema = DigestPayloadSchema.extend({
  file: ExecutorsFileSchema,
});

export const SpaceApplyHooksSchema = DigestPayloadSchema.extend({
  file: HooksFileSchema,
});

export const SpaceApplyHandlersSchema = DigestPayloadSchema.extend({
  file: HandlersFileSchema,
});

export const SpaceApplyEventsSchema = DigestPayloadSchema.extend({
  file: EventsFileSchema,
});

export const SpaceApplyBindingsSchema = DigestPayloadSchema.extend({
  file: BindingsFileSchema,
});

export const SpaceApplyFlowSchema = DigestPayloadSchema.extend({
  flow_id: z.string(),
  rel_path: z.string(),
  manifest: FlowManifestSchema,
  raw: z.record(z.unknown()).optional(),
});

export const SpaceApplyViewBuildStatusSchema = z.object({
  dist_present: z.boolean(),
  entry_present: z.boolean(),
});

export const SpaceApplyViewSchema = DigestPayloadSchema.extend({
  view_id: z.string(),
  rel_path: z.string(),
  manifest: ViewManifestSchema,
  build: SpaceApplyViewBuildStatusSchema.optional(),
});

export type SpaceApplyView = z.infer<typeof SpaceApplyViewSchema>;
export type SpaceApplyViewBuildStatus = z.infer<typeof SpaceApplyViewBuildStatusSchema>;

export const SpaceApplyBundleSchema = z.object({
  actions: SpaceApplyActionsSchema.optional(),
  executors: SpaceApplyExecutorsSchema.optional(),
  hooks: SpaceApplyHooksSchema.optional(),
  handlers: SpaceApplyHandlersSchema.optional(),
  events: SpaceApplyEventsSchema.optional(),
  bindings: SpaceApplyBindingsSchema.optional(),
  flows: z.array(SpaceApplyFlowSchema).optional(),
  views: z.array(SpaceApplyViewSchema).optional(),
});

export type SpaceApplyBundle = z.infer<typeof SpaceApplyBundleSchema>;
