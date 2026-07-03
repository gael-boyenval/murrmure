import { ulid } from "ulid";
import { MURRMURE_DENIAL_CODES, isRemoteHubBinding } from "@murrmure/contracts";
import { addSpaceId, executeCrossSpaceAsk as coreExecuteCrossSpaceAsk } from "@murrmure/hub-core";
import type { HubHandler } from "@murrmure/hub-core";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { Space } from "@murrmure/contracts";
import type { DaemonContext } from "./context.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import { relayRemoteInvoke } from "./federation-wire.js";

export type { QueryAskInput, QueryAskResult } from "@murrmure/hub-core";

function normalizeSpaceId(spaceId: string): string {
  return spaceId.startsWith("spc_") ? spaceId : addSpaceId(spaceId);
}

function bareId(spaceId: string): string {
  return bareSpaceId(spaceId);
}

function allowInbound(target: Space, sourceSpaceId: string): boolean {
  const allowlist = target.query_policy?.inbound_allowlist;
  if (!allowlist || allowlist.length === 0) return true;
  const sourceBare = bareId(sourceSpaceId);
  const sourcePrefixed = normalizeSpaceId(sourceSpaceId);
  return allowlist.some((id) => id === sourceBare || id === sourcePrefixed || id === sourceSpaceId);
}

export async function executeCrossSpaceAsk(
  handler: HubHandler,
  ctx: DaemonContext,
  murrmurePersistence: StudioPersistencePort,
  sourceSpaceId: string,
  actorId: string,
  input: import("@murrmure/hub-core").QueryAskInput,
): Promise<import("@murrmure/hub-core").QueryAskResult> {
  void handler;
  void ctx;

  return coreExecuteCrossSpaceAsk(
    {
      createQueryId: () => `qry_${ulid()}`,
      getSpace: (space_id) => murrmurePersistence.getSpace(space_id),
      getSpaceBindings: (space_id) => murrmurePersistence.getSpaceBindings(space_id),
      allowInbound,
      bareSpaceId: bareId,
      prefixedSpaceId,
      recordQuery: (row) => murrmurePersistence.insertQuery(row),
      answerLocal: async ({ query_type }) => {
        if (query_type === "spec_summary@1") {
          throw new Error("NO_QUERY_HANDLER");
        }
        throw new Error("UNKNOWN_QUERY_TYPE");
      },
      resolveRemoteTarget: async ({ bindings }) => {
        const remote = bindings.find(isRemoteHubBinding);
        if (!remote) return null;
        const health = await ctx.federationPort.checkPeerHealth(remote.peer_hub_id);
        return health.reachable ? null : { unreachable: true as const };
      },
      relayRemoteAsk: async ({ peer_hub_id, remote_space_id, query_type, params }) => {
        const query_id = `qry_${ulid()}`;
        const peer = await ctx.federationPort.getPeer(peer_hub_id);
        if (!peer) {
          return {
            ok: false,
            query_id,
            status: "failed",
            reason: "TARGET_SPACE_UNREACHABLE",
            http_status: 503,
          };
        }

        const res = await relayRemoteInvoke({
          peerEndpoint: peer.endpoint,
          authToken: peer.auth_token,
          remote_space_id,
          action_name: `query:${query_type}`,
          body: { params, query_type },
        });

        if (!res.ok) {
          return {
            ok: false,
            query_id,
            status: "failed",
            reason: res.status >= 500 ? "TARGET_SPACE_UNREACHABLE" : MURRMURE_DENIAL_CODES.QUERY_FAILED,
            http_status: res.status >= 500 ? 503 : res.status,
          };
        }

        const body = (await res.json()) as Record<string, unknown>;
        return {
          ok: true,
          query_id,
          status: "ok",
          data: (body.result as Record<string, unknown>) ?? body,
          _attribution: {
            source_space_id: remote_space_id,
            answered_by_actor_id: `federation:${peer_hub_id}`,
            query_type,
          },
        };
      },
    },
    sourceSpaceId,
    actorId,
    input,
  );
}
