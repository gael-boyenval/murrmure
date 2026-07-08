/** Maps view submit/cancel to unified step resolve (v2.2). */
export type ResolveStepBody = {
  branch: string;
  payload?: Record<string, unknown>;
};

export function mapViewSubmitToResolveStep(
  params: Record<string, unknown>,
  action: "submit" | "cancel",
): ResolveStepBody {
  if (action === "cancel") {
    return {
      branch: "cancel",
      payload: Object.keys(params).length > 0 ? params : undefined,
    };
  }
  const outcome = params.outcome;
  if (typeof outcome === "string" && outcome.length > 0) {
    const { outcome: _ignored, ...rest } = params;
    return { branch: outcome, payload: rest };
  }
  return { branch: "continue", payload: params };
}
