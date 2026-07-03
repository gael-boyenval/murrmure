/** Indexed action binding resolved from space directory (rev-1 §4.1). */
export interface IndexedActionBinding {
  name: string;
  space_id: string;
  executor: string;
  timeout_ms?: number;
  response_schema?: string;
  idempotency?: "caller_key" | "none";
  command?: string;
  cwd?: string;
  delivery?: "fail_fast" | "queue_until_executor";
}

/** Read-only catalog lookup — invoke orchestration lives in hub-core. */
export interface ActionPort {
  resolve(spaceId: string, actionName: string): Promise<IndexedActionBinding | null>;
  list(spaceId: string): Promise<IndexedActionBinding[]>;
}
