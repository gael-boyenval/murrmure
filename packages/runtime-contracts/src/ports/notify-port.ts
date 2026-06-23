import type { WaitResolution } from "../types/wait-condition.js";

export interface NotifyPort {
  resolveWait(wait_id: string, resolution: WaitResolution): Promise<void>;
}

export interface InProcessWaitRegistry {
  registerDeferred(wait_id: string): { promise: Promise<WaitResolution> };
  resolve(wait_id: string, resolution: WaitResolution): void;
}
