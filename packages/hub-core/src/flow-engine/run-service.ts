import {
  HandlerSpecSchema,
  type Capability,
  type FlowIndexEntry,
  type HandlerSpec,
  type Session,
} from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HubHandler } from "../handlers/hub.js";
import { createRun, createSession, type SessionRunDeps } from "../run/service.js";
import { spaceRunGuard } from "../run/space-guard.js";
import { admitFlowRun } from "../run/admission.js";
import {
  buildRunKey,
  prepareFlowStart,
  type FlowStartError,
} from "./start.js";
import type { FlowStepDispatch } from "./types.js";
import { buildSafeResolverMap } from "./step-view-ref.js";

export interface FlowRunServiceDeps extends SessionRunDeps {
  studio: StudioPersistencePort;
  handler: HubHandler;
}

export interface StartFlowInput {
  entry: FlowIndexEntry;
  space_id: string;
  actor_id: string;
  token_id: string;
  capabilities: Capability[];
  flow_acl?: string[];
  input?: Record<string, unknown>;
  session_id?: string;
  idempotency_header?: string;
  mode: "manual" | "event" | "schedule" | "flow_call";
  event_type?: string;
  event_source?: string;
  reference_run_ids?: string[];
  exec_context?: Record<string, unknown>;
}

export type StartFlowOutput =
  | {
      ok: true;
      session: Session;
      run_id: string;
      flow_digest: string;
      dispatch: FlowStepDispatch[];
      deduplicated?: boolean;
    }
  | { ok: false; error: FlowStartError };

function bareSession(id: string): string {
  return id.startsWith("ses_") ? id.slice(4) : id;
}

export async function startFlowRun(
  deps: FlowRunServiceDeps,
  input: StartFlowInput,
): Promise<StartFlowOutput> {
  const execContext: Record<string, unknown> = {
    input: input.input ?? {},
    ...(input.event_type ? { _event_type: input.event_type, _event_source: input.event_source } : {}),
    ...(input.exec_context ?? {}),
    _flow_actor_id: input.actor_id,
    _flow_token_id: input.token_id,
  };

  if (input.idempotency_header) {
    execContext.idempotency_key = input.idempotency_header;
  }

  // Canonical index lookup, preparation, dedup, capacity admission, session
  // creation, and run insert share one per-space guard. If apply wins first,
  // this start uses the newly committed entry (or fails if it was removed);
  // it can never admit a stale pre-apply digest.
  const guard = deps.guard ?? spaceRunGuard;
  return guard.with(input.space_id, async () => {
    if (input.idempotency_header) {
      const existingByIdem = await deps.studio.findRunByIdempotencyKey(input.idempotency_header);
      if (existingByIdem) {
        const session = await deps.studio.getSession(existingByIdem.session_id);
        if (session) {
          return dedupResult(session, existingByIdem.run_id, existingByIdem.flow_digest ?? input.entry.digest);
        }
      }
    }

    const entry = await deps.studio.getFlowIndexEntry(
      input.entry.flow_id,
      input.space_id.startsWith("spc_") ? input.space_id.slice(4) : input.space_id,
    );
    if (!entry) {
      return {
        ok: false,
        error: { code: "FLOW_NOT_FOUND", message: "Flow not indexed in target space" },
      };
    }

    const runKey = buildRunKey(
      entry,
      execContext.input as Record<string, unknown>,
      input.idempotency_header,
    );
    if (runKey) {
      execContext._run_key = runKey;
    }

    const prepared = prepareFlowStart(entry, {
      exec_context: execContext,
      origin_space_id: input.space_id,
      capabilities: input.capabilities,
      flow_acl: input.flow_acl,
      mode: input.mode,
    });
    if ("code" in prepared) {
      return { ok: false, error: prepared };
    }
    const plan = prepared;

    const handlers = (await deps.studio.listIndexedHooks(input.space_id))
      .map((raw) => HandlerSpecSchema.safeParse(raw))
      .filter((result): result is { success: true; data: HandlerSpec } => result.success)
      .map((result) => result.data);
    execContext._flow_snapshot = {
      version: 1,
      origin_space_id: entry.origin_space_id,
      flow_id: entry.flow_id,
      flow_digest: entry.digest,
      flow_name: entry.name,
      ir: entry.ir,
      step_contract_catalog: entry.step_contract_catalog,
      resolvers: buildSafeResolverMap(entry.step_contract_catalog, entry.name, handlers),
    };

    if (runKey) {
      const existing = await deps.studio.findRunByFlowKey(entry.flow_id, runKey);
      if (existing) {
        const session = await deps.studio.getSession(existing.session_id);
        if (session) {
          return dedupResult(session, existing.run_id, existing.flow_digest ?? entry.digest);
        }
      }
    }

    const admission = await admitFlowRun(deps.studio, {
      space_id: input.space_id,
      flow_id: entry.flow_id,
    });
    if (!admission.ok) {
      return { ok: false, error: admission.error };
    }

    let sessionId = input.session_id;
    if (!sessionId) {
      const session = await createSession(deps, {
        title: entry.name,
        subject: entry.flow_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
        space_id: input.space_id,
      });
      sessionId = session.session_id;
    }

    const runResult = await createRun(deps, {
      session_id: sessionId,
      space_id: input.space_id,
      flow_id: entry.flow_id,
      flow_digest: plan.flow_digest,
      input_params: execContext,
      reference_run_ids: input.reference_run_ids,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities,
    });

    if ("error" in runResult) {
      return { ok: false, error: runResult.error ?? { code: "RUN_CREATE_FAILED", message: "Run creation failed" } };
    }

    return {
      ok: true,
      session: await deps.studio.getSession(bareSession(sessionId)).then((s) =>
        s
          ? {
              session_id: `ses_${s.session_id}` as Session["session_id"],
              title: s.title,
              subject: s.subject,
              status: s.status,
              created_by: s.created_by,
              spaces_touched: s.spaces_touched.map((sp) =>
                sp.startsWith("spc_") ? (sp as Session["spaces_touched"][number]) : (`spc_${sp}` as Session["spaces_touched"][number]),
              ),
            }
          : ({
              session_id: sessionId as Session["session_id"],
              title: entry.name,
              status: "active",
              created_by: { type: "actor", actor_id: input.actor_id },
              spaces_touched: [input.space_id as Session["spaces_touched"][number]],
            } satisfies Session),
      ),
      run_id: runResult.run.run_id,
      flow_digest: plan.flow_digest,
      dispatch: plan.dispatch,
    };
  });
}

function dedupResult(session: { session_id: string; title: string; subject?: string; status: Session["status"]; created_by: Session["created_by"]; spaces_touched: string[] }, runBareId: string, flowDigest: string): StartFlowOutput {
  return {
    ok: true,
    session: {
      session_id: `ses_${session.session_id}` as Session["session_id"],
      title: session.title,
      subject: session.subject,
      status: session.status,
      created_by: session.created_by,
      spaces_touched: session.spaces_touched.map((s) =>
        s.startsWith("spc_") ? (s as Session["spaces_touched"][number]) : (`spc_${s}` as Session["spaces_touched"][number]),
      ),
    },
    run_id: `run_${runBareId}`,
    flow_digest: flowDigest,
    dispatch: [],
    deduplicated: true,
  };
}
