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

export function nestedCatalogChildren(
  catalog: StepContractCatalog,
  parent_id: string,
): StepContractCatalogEntry[] {
  const order = catalog.step_ids;
  return catalog.entries
    .filter((e) => e.parent_id === parent_id)
    .sort((a, b) => order.indexOf(a.step_id) - order.indexOf(b.step_id));
}

export function parentHasNestedChildren(catalog: StepContractCatalog, parent_id: string): boolean {
  return nestedCatalogChildren(catalog, parent_id).length > 0;
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
