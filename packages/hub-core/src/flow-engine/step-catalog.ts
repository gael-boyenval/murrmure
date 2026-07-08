import type {
  FlowIndexEntry,
  StepContractCatalog,
  StepContractCatalogEntry,
} from "@murrmure/contracts";

export function flowStepContractCatalog(entry: FlowIndexEntry | null | undefined): StepContractCatalog | null {
  return entry?.step_contract_catalog ?? null;
}

export function catalogEntryForStep(
  catalog: StepContractCatalog | null | undefined,
  step_id: string,
): StepContractCatalogEntry | undefined {
  return catalog?.entries.find((e) => e.step_id === step_id);
}

export function topLevelCatalogSteps(catalog: StepContractCatalog): StepContractCatalogEntry[] {
  return catalog.entries.filter((e) => e.parent_id === null);
}

export function isTopLevelStepContractStep(
  catalog: StepContractCatalog | null | undefined,
  step_id: string,
): boolean {
  const entry = catalogEntryForStep(catalog, step_id);
  return Boolean(entry && entry.parent_id === null);
}

export function flowUsesStepContracts(entry: FlowIndexEntry | null | undefined): boolean {
  return Boolean(entry?.step_contract_catalog?.entries.length);
}

export function requiresExplicitResolve(
  catalog: StepContractCatalog | null | undefined,
  step_id: string,
): boolean {
  const entry = catalogEntryForStep(catalog, step_id);
  if (!entry) return false;
  return entry.role === "agent" && Boolean(entry.executor?.action);
}
