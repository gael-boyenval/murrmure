/**
 * Ephemeral assignment-credential lifecycle registry.
 *
 * Each `shell_spawn` dispatch mints a run/step-scoped resolve token
 * (`MURRMURE_HUB_TOKEN`) and registers it here. Terminal paths — step resolve,
 * run terminal (fail/cancel/timeout/complete), and Hub/Desktop shutdown —
 * revoke the registered tokens via the installed revoker so no persistent
 * child credential survives a finished assignment. See ADR-012 §7.
 */

export type ResolveCredentialRevoker = (token_id: string) => void;

const byRunStep = new Map<string, Set<string>>();
const byRun = new Map<string, Set<string>>();
let revoker: ResolveCredentialRevoker | undefined;

function prefixed(run_id: string): string {
  return run_id.startsWith("run_") ? run_id : `run_${run_id}`;
}

function bareToken(token_id: string): string {
  return token_id.startsWith("tok_") ? token_id.slice(4) : token_id;
}

function stepKey(run_id: string, step_id: string): string {
  return `${prefixed(run_id)}:${step_id}`;
}

/** Install the revoker used by all revoke helpers (the daemon binds `studio.revokeToken`). */
export function setResolveCredentialRevoker(fn: ResolveCredentialRevoker | undefined): void {
  revoker = fn;
}

/**
 * Register a run/step-scoped resolve token. Returns an unregister handle.
 * The token id is stored bare (without the `tok_` prefix) to match persistence.
 */
export function registerResolveCredential(
  run_id: string,
  step_id: string,
  token_id: string,
): () => void {
  const bare = bareToken(token_id);
  const run = prefixed(run_id);
  const sk = stepKey(run_id, step_id);

  let stepSet = byRunStep.get(sk);
  if (!stepSet) {
    stepSet = new Set();
    byRunStep.set(sk, stepSet);
  }
  stepSet.add(bare);

  let runSet = byRun.get(run);
  if (!runSet) {
    runSet = new Set();
    byRun.set(run, runSet);
  }
  runSet.add(bare);

  return () => {
    stepSet?.delete(bare);
    if (stepSet?.size === 0) byRunStep.delete(sk);
    runSet?.delete(bare);
    if (runSet?.size === 0) byRun.delete(run);
  };
}

function revokeIds(ids: string[]): number {
  for (const id of ids) {
    if (revoker) {
      try {
        revoker(id);
      } catch {
        // Revocation is best-effort; a missing token is already revoked/gone.
      }
    }
  }
  return ids.length;
}

/** Revoke the resolve credentials minted for one step (on resolve/auto-complete). */
export function revokeStepResolveCredentials(run_id: string, step_id: string): number {
  const sk = stepKey(run_id, step_id);
  const stepSet = byRunStep.get(sk);
  if (!stepSet) return 0;
  const ids = [...stepSet];
  byRunStep.delete(sk);
  const runSet = byRun.get(prefixed(run_id));
  for (const id of ids) runSet?.delete(id);
  if (runSet?.size === 0) byRun.delete(prefixed(run_id));
  return revokeIds(ids);
}

/** Revoke every resolve credential minted for a run (on run terminal). */
export function revokeRunResolveCredentials(run_id: string): number {
  const run = prefixed(run_id);
  const runSet = byRun.get(run);
  if (!runSet) return 0;
  const ids = [...runSet];
  byRun.delete(run);
  for (const sk of [...byRunStep.keys()]) {
    if (sk.startsWith(`${run}:`)) byRunStep.delete(sk);
  }
  return revokeIds(ids);
}

/** Revoke all registered resolve credentials (on Hub/Desktop shutdown). */
export function revokeAllResolveCredentials(): number {
  const ids = new Set<string>();
  for (const set of byRunStep.values()) {
    for (const id of set) ids.add(id);
  }
  byRunStep.clear();
  byRun.clear();
  return revokeIds([...ids]);
}

/** Test helper: reset the registry and revoker. */
export function clearResolveCredentialRegistry(): void {
  byRunStep.clear();
  byRun.clear();
  revoker = undefined;
}

/** Test/observability helper: snapshot registered credentials by run/step. */
export function listRegisteredResolveCredentials(): Array<{
  run_id: string;
  step_id: string;
  token_ids: string[];
}> {
  return [...byRunStep.entries()].map(([sk, set]) => {
    const sep = sk.indexOf(":");
    return {
      run_id: sep >= 0 ? sk.slice(0, sep) : sk,
      step_id: sep >= 0 ? sk.slice(sep + 1) : "",
      token_ids: [...set],
    };
  });
}
