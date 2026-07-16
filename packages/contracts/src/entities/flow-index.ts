import { z } from "zod";
import { FlowIdSchema, SpaceIdSchema } from "../ids.js";
import { CapabilitySchema } from "../grants/capability.js";
import { FlowStartConditionsSchema } from "../flow/manifest.js";
import { FlowIrSchema } from "../flow/ir.js";
import { StepContractCatalogSchema } from "./step-contract.js";

export { FlowViewRefSchema } from "../flow/view-ref.js";
export type { FlowViewRef } from "../flow/view-ref.js";

export const FlowIndexEntrySchema = z.object({
  flow_id: FlowIdSchema,
  origin_space_id: SpaceIdSchema,
  digest: z.string(),
  name: z.string(),
  triggers: FlowStartConditionsSchema,
  step_spaces: z.array(SpaceIdSchema),
  grants_required: z.array(CapabilitySchema),
  ir: FlowIrSchema.optional(),
  step_contract_catalog: StepContractCatalogSchema.optional(),
});

export type FlowIndexEntry = z.infer<typeof FlowIndexEntrySchema>;

/** Legacy index rows may omit `triggers`; treat as invoke-only `{}`. */
export function normalizeFlowIndexEntry(entry: FlowIndexEntry): FlowIndexEntry {
  return {
    ...entry,
    triggers: entry.triggers ?? {},
  };
}
