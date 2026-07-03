/** Shell adapter — maps view submit/cancel to gate resolve wire v2 (decision 04). */
export type GateResolveV2Body = {
  disposition: "continue" | "cancel";
  output?: Record<string, unknown>;
};

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
