/** Shell adapter — maps view submit/cancel to gate resolve wire v2 (decision 04). */
export type GateResolveV2Body = {
  disposition: "continue" | "cancel";
  output?: Record<string, unknown>;
};

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

export function mapViewSubmitToGateResolve(
  params: Record<string, unknown>,
  action: "submit" | "cancel",
): GateResolveV2Body {
  if (action === "cancel") {
    return Object.keys(params).length > 0
      ? { disposition: "cancel", output: params }
      : { disposition: "cancel" };
  }
  return { disposition: "continue", output: params };
}
