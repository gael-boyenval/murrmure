import type { ArtifactV1 } from "@murrmure/contracts";
import { planMaterialize, type MaterializePlan } from "./materialize.js";

export interface ResolvedInvokeArtifact {
  transfer_id: string;
  name: string;
  digest: string;
  local_path: string;
  relative_path: string;
}

export async function resolveArtifactsIn(input: {
  transfer_ids: string[];
  requester_space_id: string;
  requester_actor_id: string;
  space_root: string;
  load: (transfer_id: string) => Promise<
    | {
        manifest: ArtifactV1;
        expires_at: string;
        bytes: Uint8Array;
      }
    | null
    | undefined
  >;
}): Promise<ResolvedInvokeArtifact[] | { code: string; message: string }> {
  const resolved: ResolvedInvokeArtifact[] = [];

  for (const transfer_id of input.transfer_ids) {
    const row = await input.load(transfer_id);
    if (!row) {
      return {
        code: "ARTIFACT_NOT_FOUND",
        message: `Artifact '${transfer_id}' is not registered`,
      };
    }

    const plan = planMaterialize({
      transfer_id,
      name: row.manifest.name,
      digest: row.manifest.digest,
      space_root: input.space_root,
      authorized_readers: row.manifest.authorized_readers,
      requester_space_id: input.requester_space_id,
      requester_actor_id: input.requester_actor_id,
      expires_at: row.expires_at,
      bytes: row.bytes,
    });

    if ("code" in plan) {
      return plan;
    }

    resolved.push(toInvokeArtifact(plan));
  }

  return resolved;
}

function toInvokeArtifact(plan: MaterializePlan): ResolvedInvokeArtifact {
  return {
    transfer_id: plan.transfer_id,
    name: plan.name,
    digest: plan.digest,
    local_path: plan.absolute_path,
    relative_path: plan.relative_path,
  };
}
