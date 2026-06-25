import { existsSync, readFileSync } from "node:fs";

const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_INTERVAL_MS = 250;
const DEFAULT_CHILD_EXIT_TIMEOUT_MS = 5_000;

export interface WaitForHubHealthOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface LockOwnerRecord {
  endpoint?: string;
  pid?: number;
}

export interface ExistingHubStatus {
  running: boolean;
  endpoint?: string;
}

export interface ChildProcessLike {
  exited: Promise<unknown>;
  kill(signal?: number | string): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

export async function waitForHubHealth(url: string, options: WaitForHubHealthOptions = {}): Promise<number> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_HEALTH_INTERVAL_MS;
  const startedAt = now();
  let attempt = 0;
  let lastError: unknown = null;

  while (now() - startedAt <= timeoutMs) {
    attempt += 1;
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        signal: createAbortSignal(Math.max(1_000, intervalMs * 2)),
      });
      if (response.ok) {
        return attempt;
      }
      lastError = new Error(`Health endpoint returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await sleepImpl(intervalMs);
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
  throw new Error(`Hub health did not become ready in ${timeoutMs}ms (${reason}).`);
}

export function readLockOwner(lockOwnerPath: string): LockOwnerRecord | null {
  if (!existsSync(lockOwnerPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(lockOwnerPath, "utf-8")) as LockOwnerRecord;
  } catch {
    return null;
  }
}

export async function detectExistingHub(
  lockOwnerPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExistingHubStatus> {
  const owner = readLockOwner(lockOwnerPath);
  if (!owner?.endpoint) {
    return { running: false };
  }

  const healthUrl = new URL("/v1/health", owner.endpoint).toString();
  try {
    const response = await fetchImpl(healthUrl, {
      method: "GET",
      signal: createAbortSignal(1_500),
    });
    if (response.ok) {
      return { running: true, endpoint: owner.endpoint };
    }
  } catch {
    // Existing owner is stale or unreachable.
  }
  return { running: false, endpoint: owner.endpoint };
}

export async function stopHubChild(
  child: ChildProcessLike,
  options: { timeoutMs?: number; sleepImpl?: (ms: number) => Promise<void> } = {},
): Promise<"exited" | "killed"> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHILD_EXIT_TIMEOUT_MS;
  const sleepImpl = options.sleepImpl ?? sleep;

  try {
    child.kill("SIGTERM");
  } catch {
    // Process may already be gone.
  }

  const result = await Promise.race([
    child.exited.then(() => "exited" as const).catch(() => "exited" as const),
    sleepImpl(timeoutMs).then(() => "timeout" as const),
  ]);
  if (result === "exited") {
    return "exited";
  }

  try {
    child.kill("SIGKILL");
  } catch {
    // Ignore kill failures when process already exited.
  }
  await child.exited.catch(() => undefined);
  return "killed";
}
