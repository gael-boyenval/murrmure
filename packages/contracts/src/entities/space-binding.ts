import { z } from "zod";

/** rev-1 §16 #1 — stable space id + host path bindings (path is never the id). */
export const LocalSpaceBindingSchema = z.object({
  host: z.string(),
  path: z.string(),
  primary: z.boolean().default(false),
});

/** rev-1 §16 #9 — virtual remote space (no local path). */
export const RemoteHubSpaceBindingSchema = z.object({
  type: z.literal("remote_hub"),
  peer_hub_id: z.string(),
  remote_space_id: z.string(),
  primary: z.boolean().default(true),
});

export const SpaceBindingSchema = z.union([RemoteHubSpaceBindingSchema, LocalSpaceBindingSchema]);

export const SpaceBindingsSchema = z.array(SpaceBindingSchema);

export type LocalSpaceBinding = z.infer<typeof LocalSpaceBindingSchema>;
export type RemoteHubSpaceBinding = z.infer<typeof RemoteHubSpaceBindingSchema>;
export type SpaceBinding = z.infer<typeof SpaceBindingSchema>;

export function isRemoteHubBinding(binding: SpaceBinding): binding is RemoteHubSpaceBinding {
  return "type" in binding && binding.type === "remote_hub";
}

export function isLocalSpaceBinding(binding: SpaceBinding): binding is LocalSpaceBinding {
  return !isRemoteHubBinding(binding);
}
