import { z } from "zod";

export const EvolutionStateSchema = z.enum([
  "draft",
  "validated",
  "tested",
  "promoted_pending",
  "live",
  "superseded",
]);

export const FlowInstallSchema = z.object({
  install_id: z.string(),
  space_id: z.string(),
  flow_id: z.string(),
  version: z.string(),
  contract_ref_id: z.string(),
  evolution_state: EvolutionStateSchema,
  config: z.record(z.unknown()).optional(),
  gate_id: z.string().optional(),
  bundle_digest: z.string().optional(),
  source_digest: z.string().optional(),
  source_metadata: z
    .object({
      source_path: z.string().optional(),
      built_at: z.string().optional(),
      sdk_version: z.string().optional(),
      cli_version: z.string().optional(),
      dev_kit_version: z.string().optional(),
    })
    .optional(),
  routes_prefix: z.string().optional(),
  canvas_route: z.string().optional(),
});

export type FlowInstall = z.infer<typeof FlowInstallSchema>;
export type EvolutionState = z.infer<typeof EvolutionStateSchema>;
