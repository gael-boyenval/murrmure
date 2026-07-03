import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { Space } from "@murrmure/contracts";
import { isRemoteHubBinding, type SpaceBinding } from "@murrmure/contracts";

export interface QueryAskInput {
  target_space_id: string;
  query_type: string;
  params?: Record<string, unknown>;
  timeout_ms?: number;
}

export type QueryAskResult =
  | {
      ok: true;
      query_id: string;
      status: "ok";
      data: Record<string, unknown>;
      _attribution: {
        source_space_id: string;
        answered_by_actor_id: string;
        query_type: string;
      };
    }
  | {
      ok: false;
      query_id: string;
      status: "failed";
      reason: string;
      http_status: number;
    };

export interface CrossSpaceQueryDeps {
  createQueryId(): string;
  getSpace(space_id: string): Promise<Space | null>;
  getSpaceBindings(space_id: string): Promise<SpaceBinding[]>;
  allowInbound(target: Space, sourceSpaceId: string): boolean;
  answerLocal(input: {
    target_space_id: string;
    query_type: string;
    params: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  resolveRemoteTarget?(input: {
    target_space_id: string;
    bindings: SpaceBinding[];
  }): Promise<
    | { peer_hub_id: string; remote_space_id: string }
    | { unreachable: true }
    | null
  >;
  relayRemoteAsk?(input: {
    peer_hub_id: string;
    remote_space_id: string;
    query_type: string;
    params: Record<string, unknown>;
    timeout_ms?: number;
  }): Promise<QueryAskResult>;
  recordQuery(row: Record<string, unknown>): Promise<void>;
  bareSpaceId(space_id: string): string;
  prefixedSpaceId(space_id: string): string;
}

function findRemoteBinding(
  bindings: SpaceBinding[],
  targetBare: string,
): { peer_hub_id: string; remote_space_id: string } | null {
  for (const binding of bindings) {
    if (!isRemoteHubBinding(binding)) continue;
    const remoteBare = binding.remote_space_id.startsWith("spc_")
      ? binding.remote_space_id.slice(4)
      : binding.remote_space_id;
    if (remoteBare === targetBare || binding.remote_space_id === targetBare) {
      return { peer_hub_id: binding.peer_hub_id, remote_space_id: binding.remote_space_id };
    }
  }
  return null;
}

/** Same-hub + federated ask orchestration (XS0 + XS1 relay). */
export async function executeCrossSpaceAsk(
  deps: CrossSpaceQueryDeps,
  sourceSpaceId: string,
  actorId: string,
  input: QueryAskInput,
): Promise<QueryAskResult> {
  const query_id = deps.createQueryId();
  const targetBare = deps.bareSpaceId(input.target_space_id);
  const target = await deps.getSpace(targetBare);

  if (!target) {
    const sourceBindings = await deps.getSpaceBindings(deps.bareSpaceId(sourceSpaceId));
    const remote = findRemoteBinding(sourceBindings, targetBare);
    if (remote && deps.relayRemoteAsk) {
      const peerReachable = await deps.resolveRemoteTarget?.({
        target_space_id: input.target_space_id,
        bindings: sourceBindings,
      });
      if (peerReachable && "unreachable" in peerReachable) {
        return {
          ok: false,
          query_id,
          status: "failed",
          reason: "TARGET_SPACE_UNREACHABLE",
          http_status: 503,
        };
      }
      return deps.relayRemoteAsk({
        peer_hub_id: remote.peer_hub_id,
        remote_space_id: remote.remote_space_id,
        query_type: input.query_type,
        params: input.params ?? {},
        timeout_ms: input.timeout_ms,
      });
    }

    return {
      ok: false,
      query_id,
      status: "failed",
      reason: "TARGET_SPACE_UNREACHABLE",
      http_status: 404,
    };
  }

  if (!deps.allowInbound(target, sourceSpaceId)) {
    return {
      ok: false,
      query_id,
      status: "failed",
      reason: MURRMURE_DENIAL_CODES.QUERY_POLICY_DENIED,
      http_status: 403,
    };
  }

  try {
    const data = await deps.answerLocal({
      target_space_id: input.target_space_id,
      query_type: input.query_type,
      params: input.params ?? {},
    });

    await deps.recordQuery({
      query_id,
      space_id: deps.bareSpaceId(sourceSpaceId),
      target_space_id: targetBare,
      asker_actor_id: actorId,
      schema: input.query_type,
      ask_payload: input.params ?? {},
      answer_payload: data,
      status: "answered",
      created_at: new Date().toISOString(),
    });

    return {
      ok: true,
      query_id,
      status: "ok",
      data,
      _attribution: {
        source_space_id: deps.prefixedSpaceId(targetBare),
        answered_by_actor_id: "system:feature-spec",
        query_type: input.query_type,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === "UNKNOWN_QUERY_TYPE") {
      return {
        ok: false,
        query_id,
        status: "failed",
        reason: "UNKNOWN_QUERY_TYPE",
        http_status: 400,
      };
    }
    return {
      ok: false,
      query_id,
      status: "failed",
      reason: MURRMURE_DENIAL_CODES.QUERY_FAILED,
      http_status: 404,
    };
  }
}
