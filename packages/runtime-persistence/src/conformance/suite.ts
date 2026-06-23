import type { PersistencePort } from "@runtime/contracts";
import { InMemoryPersistence } from "../memory/store.js";

/**
 * Adapter conformance stub (K21).
 * Any persistence backend must produce identical journal/snapshot
 * for the same command stream executed through the kernel.
 */
export interface ConformanceExpectation {
  journalTypes: string[];
  snapshotState?: string;
  snapshotRevision?: number;
}

export function createConformancePersistence(): PersistencePort {
  return new InMemoryPersistence();
}
