/**
 * Flow manifest lint — re-exports hub-core step-contract compile lints for CLI use.
 */
export {
  compileStepContractCatalog,
  lintStepContractManifest,
  formatCatalogDigestSummary,
  manifestUsesStepContracts,
  findLegacyStepKinds,
  STEP_CONTRACT_MIGRATION_DOC,
  KNOWN_MURRMURE_TOKENS,
  type StepContractLintWarning,
  type StepContractCompileResult,
} from "@murrmure/hub-core";

import type { FlowManifest } from "@murrmure/contracts";
import { lintStepContractManifest, type StepContractLintWarning } from "@murrmure/hub-core";

export function lintFlowManifest(manifest: FlowManifest, flowId: string): StepContractLintWarning[] {
  return lintStepContractManifest(manifest, flowId);
}
