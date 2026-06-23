import { z } from "zod";

/** P5 legacy manifest — accepted with migration warning only. */
export const LegacyFlowManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  contract_ref_id: z.string(),
  routes_prefix: z.string(),
  mcp_tools: z.array(z.string()),
  mount_export: z.string(),
});

export const FlowManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  version: z.string(),
  routes_prefix: z.string().regex(/^\/api\/[a-z0-9-]+$/),
  ui: z.object({
    entry: z.string(),
    canvas_route: z.string(),
    shell_html: z.string().optional(),
    assets: z.array(z.string()).optional(),
  }),
  server: z.object({
    mount_module: z.string(),
  }),
  mcp_tools_by_version: z.record(z.string(), z.array(z.string())),
  query_types_by_version: z.record(z.string(), z.array(z.string())).optional(),
  config_schema: z.string().optional(),
  tests: z.object({ contract: z.string().optional() }).optional(),
});

export type FlowManifest = z.infer<typeof FlowManifestSchema>;
export type LegacyFlowManifest = z.infer<typeof LegacyFlowManifestSchema>;

export const ContractGraphSchema = z.object({
  schema_version: z.string().optional(),
  initial_state: z.string(),
  states: z.record(
    z.string(),
    z.object({
      on: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
      meta: z.record(z.unknown()).optional(),
    }),
  ),
});

export const McpToolsRegistrySchema = z.object({
  tools: z.record(
    z.string(),
    z.object({
      http: z.object({ method: z.string(), path: z.string() }).optional(),
      input_schema: z.record(z.unknown()).optional(),
      description: z.string().optional(),
    }),
  ),
});
