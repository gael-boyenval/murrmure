export type DevHubHealthState = {
  unhealthy_since?: number;
};

export type DevHubHealthDecision = {
  state: DevHubHealthState;
  failed: boolean;
};

/**
 * Allow short watch-mode restarts, but fail the whole dev stack when the Hub
 * remains unavailable. This keeps the original daemon error near the end of
 * the terminal instead of burying it under unbounded Vite proxy noise.
 */
export function observeDevHubHealth(
  state: DevHubHealthState,
  input: { healthy: boolean; now: number; grace_ms: number },
): DevHubHealthDecision {
  if (input.healthy) {
    return { state: {}, failed: false };
  }
  const unhealthy_since = state.unhealthy_since ?? input.now;
  return {
    state: { unhealthy_since },
    failed: input.now - unhealthy_since >= input.grace_ms,
  };
}
