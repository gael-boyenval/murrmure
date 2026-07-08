/** Maps view submit/cancel to unified step resolve (v2.2). */
export type ResolveStepArtifactOut = {
  slot: string;
  path: string;
};

export type ViewSubmitArtifact = {
  slot: string;
  filename: string;
  content_base64: string;
};

export type ResolveStepBody = {
  branch: string;
  payload?: Record<string, unknown>;
  artifacts_out?: ResolveStepArtifactOut[];
};

export function mapViewSubmitToResolveStep(
  params: Record<string, unknown>,
  action: "submit" | "cancel",
  artifacts_out?: ResolveStepArtifactOut[],
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
    return { branch: outcome, payload: rest, artifacts_out };
  }
  return { branch: "continue", payload: params, artifacts_out };
}

export async function uploadViewArtifacts(input: {
  hub_base_url: string;
  token: string;
  run_id: string;
  step_id: string;
  artifacts: ViewSubmitArtifact[];
}): Promise<ResolveStepArtifactOut[]> {
  const base = input.hub_base_url.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${input.token}`,
    "Content-Type": "application/json",
  };
  const out: ResolveStepArtifactOut[] = [];
  for (const artifact of input.artifacts) {
    const res = await fetch(
      `${base}/v1/runs/${encodeURIComponent(input.run_id)}/steps/${encodeURIComponent(input.step_id)}/work/upload`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          filename: artifact.filename,
          content_base64: artifact.content_base64,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`work upload failed for slot '${artifact.slot}': ${res.status}`);
    }
    const body = (await res.json()) as { path?: string };
    if (!body.path) {
      throw new Error(`work upload missing path for slot '${artifact.slot}'`);
    }
    out.push({ slot: artifact.slot, path: body.path });
  }
  return out;
}
