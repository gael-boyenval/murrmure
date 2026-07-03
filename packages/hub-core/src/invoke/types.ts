import type { IndexedAction } from "@murrmure/contracts";
import type {
  DispatchOutcome,
  ExecutorBinding,
  ExecutorPort,
  InvokeRequest,
  InvokeResponse,
} from "@murrmure/runtime-contracts";

export interface ResolvedInvoke {
  action: IndexedAction;
  binding: ExecutorBinding;
  space_root?: string;
  delivery: "fail_fast" | "queue_until_executor";
}

export interface InvokeMemoStore {
  get(key: string): DispatchOutcome | null | Promise<DispatchOutcome | null>;
  set(key: string, outcome: DispatchOutcome): void | Promise<void>;
}

export interface ExecutorRegistry {
  getPort(binding: ExecutorBinding): ExecutorPort | null;
}

export interface InvokeJournalWriter {
  append(input: {
    type: string;
    space_id: string;
    session_id?: string;
    run_id?: string;
    step_id?: string;
    actor_id: string;
    token_id: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

export interface QueuedInvokeItem {
  resolved: ResolvedInvoke;
  request: InvokeRequest;
  actor: { actor_id: string; token_id: string };
  step_id: string;
  idempotencyKey: string | null;
}

export interface InvokeQueuePort {
  enqueue(item: QueuedInvokeItem): void;
}

export interface InvokeOrchestratorDeps {
  registry: ExecutorRegistry;
  memoStore: InvokeMemoStore;
  journal: InvokeJournalWriter;
  invokeQueue?: InvokeQueuePort;
  clock: { nowIso(): string };
}

export type { DispatchOutcome, ExecutorBinding, InvokeRequest, InvokeResponse };
