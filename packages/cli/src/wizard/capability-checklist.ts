import * as p from "@clack/prompts";
import {
  GRANTABLE_CAPABILITY_OPTIONS,
  LOCAL_TOOLS_CAPABILITIES,
  type GrantableCapability,
} from "./capabilities.js";

export async function promptCapabilityChecklist(options?: {
  initialValues?: readonly GrantableCapability[];
}): Promise<GrantableCapability[]> {
  const selected = await p.multiselect({
    message: "Select capabilities for this connection grant",
    options: GRANTABLE_CAPABILITY_OPTIONS.map((entry) => ({
      value: entry.value,
      label: entry.label,
      hint: entry.hint,
    })),
    initialValues: [...(options?.initialValues ?? LOCAL_TOOLS_CAPABILITIES)],
    required: true,
  });
  if (p.isCancel(selected)) {
    p.cancel("Grant cancelled");
    process.exit(0);
  }
  return selected as GrantableCapability[];
}
