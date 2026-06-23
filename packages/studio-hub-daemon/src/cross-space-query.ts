import { ulid } from "ulid";
import { STUDIO_DENIAL_CODES } from "@murrmure/contracts";
import { addSpaceId } from "@murrmure/hub-core";
import type { HubHandler } from "@murrmure/hub-core";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { Space } from "@murrmure/contracts";
import type { DaemonContext } from "./context.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import { invokeWorkerQuery } from "./worker-tool-dispatch.js";

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

function findQueryMount(ctx: DaemonContext, targetSpaceId: string, queryType: string) {
  const bare = bareId(targetSpaceId);
  return ctx.mountRegistry.listAll().find(
    (m) =>
      bareSpaceId(m.space_id) === bare &&
      m.bundle_digest &&
      (m.query_types?.includes(queryType) ?? false),
  );
}

async function answerSpecSummary(
  ctx: DaemonContext,
  targetSpaceId: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const mount = findQueryMount(ctx, targetSpaceId, "spec_summary@1");
  if (!mount) throw new Error("NO_QUERY_HANDLER");
  const data = await invokeWorkerQuery(ctx, mount, "/query/spec_summary", params, targetSpaceId);
  if ("body_ref" in data) delete data.body_ref;
  return data;
}

export async function executeCrossSpaceAsk(
  handler: HubHandler,
  ctx: DaemonContext,
  studioPersistence: StudioPersistencePort,
  sourceSpaceId: string,
  actorId: string,
  input: QueryAskInput,
): Promise<QueryAskResult> {
  void handler;
  const query_id = `qry_${ulid()}`;
  const targetBare = bareId(input.target_space_id);
  const target = await studioPersistence.getSpace(targetBare);
  if (!target) {
    return {
      ok: false,
      query_id,
      status: "failed",
      reason: "TARGET_SPACE_UNREACHABLE",
      http_status: 404,
    };
  }

  if (!allowInbound(target, sourceSpaceId)) {
    return {
      ok: false,
      query_id,
      status: "failed",
      reason: STUDIO_DENIAL_CODES.QUERY_POLICY_DENIED,
      http_status: 403,
    };
  }

  try {
    let data: Record<string, unknown>;
    if (input.query_type === "spec_summary@1") {
      data = await answerSpecSummary(ctx, input.target_space_id, input.params ?? {});
    } else {
      return {
        ok: false,
        query_id,
        status: "failed",
        reason: "UNKNOWN_QUERY_TYPE",
        http_status: 400,
      };
    }

    await studioPersistence.insertQuery({
      query_id,
      space_id: bareId(sourceSpaceId),
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
        source_space_id: prefixedSpaceId(targetBare),
        answered_by_actor_id: "system:feature-spec",
        query_type: input.query_type,
      },
    };
  } catch {
    return {
      ok: false,
      query_id,
      status: "failed",
      reason: STUDIO_DENIAL_CODES.QUERY_FAILED,
      http_status: 404,
    };
  }
}
