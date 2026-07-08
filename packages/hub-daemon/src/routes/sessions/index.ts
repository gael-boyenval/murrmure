import type { Hono } from "hono";
import { ulid } from "ulid";
import { JOURNAL_EVENT_TYPES, type Capability, type Session, ActionCompleteBodySchema } from "@murrmure/contracts";
import {
  cancelRun,
  cancelSession,
  createRun,
  createSession,
  getSessionWithStatus,
  listSessionsFiltered,
  maybeCompleteHeadlessRun,
  replayHeadlessSteps,
  hasCapability,
  retryRun,
  runIdToInstanceId,
  toRunDto,
  applyStepMemoFromJournal,
  attachOrchestration,
  parseOrchestrationPayloadRef,
  isOrchestrationGate,
  compileFlowIr,
  mergeActionResultIntoRun,
  completeDispatchedAction,
  flowStepContractCatalog,
  requiresExplicitResolve,
} from "@murrmure/hub-core";
import { broadcastSse, type DaemonContext } from "../../context.js";
import { requireToken, type TokenContext } from "../../auth.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";

function sessionRunDeps(ctx: DaemonContext) {
  return {
    studio: ctx.murrmurePersistence,
    handler: ctx.handler,
    ids: { ulid: () => ulid() },
    clock: { nowIso: () => new Date().toISOString() },
    cancelTimeoutMs: ctx.config.cancelTimeoutMs,
    dispatchSteps: async (input: {
      dispatch: import("@murrmure/hub-core").FlowStepDispatch[];
      session_id: string;
      run_id: string;
      actor_id: string;
      token_id: string;
    }) => {
      const { dispatchFlowSteps } = await import("../../flow-dispatch.js");
      await dispatchFlowSteps(ctx.invokeService, input);
    },
  };
}

async function caps(ctx: DaemonContext, auth: TokenContext): Promise<Capability[]> {
  return resolveTokenCapabilities(ctx.murrmurePersistence, auth);
}

function filterSessionsByReadableSpaces(
  auth: TokenContext,
  effective: Capability[],
  sessions: Session[],
): Session[] {
  if (hasCapability(effective, "hub:admin") || auth.space_id === "bootstrap") {
    return sessions;
  }

  const readableSpaces = new Set<string>();
  if (hasCapability(effective, "space:read")) {
    readableSpaces.add(prefixedSpaceId(bareSpaceId(auth.space_id)));
  } else if (hasCapability(effective, "journal:read")) {
    readableSpaces.add(prefixedSpaceId(bareSpaceId(auth.space_id)));
  }

  if (readableSpaces.size === 0) return [];

  return sessions.filter(
    (session) =>
      session.spaces_touched.length === 0 ||
      session.spaces_touched.some((spaceId) => readableSpaces.has(spaceId)),
  );
}

export function mountSessionRunRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence, handler } = ctx;
  const deps = () => sessionRunDeps(ctx);

  app.post("/v1/sessions", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    if (
      !hasCapability(effective, "flow:run") &&
      !hasCapability(effective, "action:invoke")
    ) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "flow:run or action:invoke required" }, 403);
    }

    const body = await c.req.json();
    const space_id = body.space_id ? prefixedSpaceId(bareSpaceId(String(body.space_id))) : undefined;
    const session = await createSession(deps(), {
      title: String(body.title ?? "Session"),
      subject: body.subject ? String(body.subject) : undefined,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      space_id,
    });
    return c.json(session, 201);
  });

  app.get("/v1/sessions", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    if (!hasCapability(effective, ["space:read", "journal:read"])) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "space:read or journal:read required" }, 403);
    }

    const status = c.req.query("status") as import("@murrmure/contracts").SessionStatus | undefined;
    const space_id = c.req.query("space_id");
    const sessions = filterSessionsByReadableSpaces(
      auth,
      effective,
      await listSessionsFiltered(murrmurePersistence, {
        status,
        space_id: space_id ? prefixedSpaceId(bareSpaceId(space_id)) : undefined,
      }),
    );
    return c.json({ sessions });
  });

  app.get("/v1/sessions/:session_id", async (c) => {
    const session_id = c.req.param("session_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireCapability(auth, "space:read", await caps(ctx, auth));
    if (scopeCheck) return scopeCheck;

    const session = await getSessionWithStatus(murrmurePersistence, session_id);
    if (!session) return c.json({ code: "session_not_found", message: "Session not found" }, 404);
    return c.json(session);
  });

  app.get("/v1/sessions/:session_id/runs", async (c) => {
    const session_id = c.req.param("session_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireCapability(auth, "space:read", await caps(ctx, auth));
    if (scopeCheck) return scopeCheck;

    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    const rows = await murrmurePersistence.listRunsBySession(bare);
    return c.json({ runs: rows.map((r) => toRunDto(r)) });
  });

  app.post("/v1/sessions/:session_id/runs", async (c) => {
    const session_id = c.req.param("session_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    const scopeCheck = requireCapability(auth, "flow:run", effective);
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json();
    const space_id = body.space_id
      ? prefixedSpaceId(bareSpaceId(String(body.space_id)))
      : auth.space_id !== "bootstrap"
        ? prefixedSpaceId(bareSpaceId(auth.space_id))
        : undefined;

    const result = await createRun(deps(), {
      session_id,
      space_id,
      flow_id: body.flow_id ?? null,
      flow_digest: body.flow_digest,
      input_params: body.input,
      reference_run_ids: body.reference_run_ids,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      capabilities: effective,
      contract_ref_id: body.contract_ref_id,
      metadata: body.metadata,
    });

    if ("error" in result) {
      const err = result.error ?? { code: "UNKNOWN", message: "Request failed" };
      return c.json(err, err.code === "SCOPE_ENFORCEMENT_FAILURE" ? 403 : 404);
    }

    if (body.flow_id && space_id) {
      const { dispatchFlowSteps } = await import("../../flow-dispatch.js");
      const { prepareFlowStart } = await import("@murrmure/hub-core");
      const entry = await murrmurePersistence.getFlowIndexEntry(
        String(body.flow_id),
        bareSpaceId(space_id),
      );
      if (entry?.ir) {
        const execContext = { input: (body.input as Record<string, unknown>) ?? {} };
        const prep = prepareFlowStart(entry, {
          exec_context: execContext,
          origin_space_id: space_id,
          capabilities: effective,
          flow_acl: auth.flow_acl,
          mode: "manual",
        });
        if (!("code" in prep) && prep.dispatch.length) {
          await dispatchFlowSteps(ctx.invokeService, {
            dispatch: prep.dispatch,
            session_id,
            run_id: result.run.run_id,
            actor_id: auth.actor_id,
            token_id: auth.token_id,
          });
        }
      }
    }

    return c.json(result, 201);
  });

  app.post("/v1/sessions/:session_id/cancel", async (c) => {
    const session_id = c.req.param("session_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    const scopeCheck = requireCapability(auth, "gate:resolve", effective);
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json().catch(() => ({}));
    const space_id = body.space_id
      ? prefixedSpaceId(bareSpaceId(String(body.space_id)))
      : auth.space_id !== "bootstrap"
        ? prefixedSpaceId(bareSpaceId(auth.space_id))
        : undefined;

    const result = await cancelSession(deps(), {
      session_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      space_id,
    });
    if ("error" in result) return c.json(result.error, 404);

    const broadcastSpaceId = space_id ?? result.session.spaces_touched[0];
    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: JOURNAL_EVENT_TYPES.SESSION_CANCEL_REQUESTED,
        ...(broadcastSpaceId ? { space_id: broadcastSpaceId } : {}),
        session_id: result.session.session_id,
      },
    });

    return c.json(result.session);
  });

  app.post("/v1/sessions/:session_id/orchestration/attach", async (c) => {
    const session_id = c.req.param("session_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    const scopeCheck = requireCapability(auth, "flow:run", effective);
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json();
    const space_id = body.space_id
      ? prefixedSpaceId(bareSpaceId(String(body.space_id)))
      : auth.space_id !== "bootstrap"
        ? prefixedSpaceId(bareSpaceId(auth.space_id))
        : undefined;

    if (!space_id) {
      return c.json({ code: "INVALID_REQUEST", message: "space_id required" }, 400);
    }

    const result = await attachOrchestration(deps(), {
      session_id,
      space_id,
      payload: body.kind ? body : { kind: "murrmure.flow.attach/v1", manifest: body.manifest ?? body },
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      capabilities: effective,
      breakglass: body.breakglass === true,
    });

    if (!result.ok) {
      const status =
        result.error.code === "SCOPE_ENFORCEMENT_FAILURE"
          ? 403
          : result.error.code === "SESSION_NOT_FOUND"
            ? 404
            : 400;
      return c.json(result.error, status);
    }

    if (result.gate_id) {
      const { broadcastSse } = await import("../../context.js");
      broadcastSse(ctx, {
        event: "gate.pending",
        data: { gate_id: result.gate_id, run_id: result.run_id },
      });
      broadcastSse(ctx, {
        event: "notification.changed",
        data: { gate_id: result.gate_id },
      });
    }

    return c.json(
      {
        run_id: result.run_id,
        gate_id: result.gate_id,
        preview: result.preview,
        bound: result.bound ?? false,
      },
      201,
    );
  });

  app.get("/v1/runs/:run_id", async (c) => {
    const run_id = c.req.param("run_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireCapability(auth, "space:read", await caps(ctx, auth));
    if (scopeCheck) return scopeCheck;

    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id.startsWith("ins_") ? run_id.slice(4) : run_id;
    const row = await murrmurePersistence.getRun(bare);
    if (!row) return c.json({ code: "run_not_found", message: "Run not found" }, 404);

    const steps = await murrmurePersistence.listRunStepMemos(`run_${bare}`);
    const run = toRunDto(row);

    let journal_replay: ReturnType<typeof replayHeadlessSteps> | undefined;
    if (!row.flow_id && row.space_id) {
      const tail = await handler.query("event.tail", {
        space_id: prefixedSpaceId(row.space_id),
        from_seq: 0,
      });
      const events = Array.isArray(tail)
        ? tail
        : ((tail as { events?: Array<{ type: string; ts?: string; payload: Record<string, unknown> }> })
            .events ?? []);
      const filtered = events.filter(
        (e) => e.payload.run_id === run.run_id || e.payload.run_id === `run_${bare}`,
      );
      journal_replay = replayHeadlessSteps(run.run_id, filtered.map((e) => ({
        type: e.type,
        ts: e.ts ?? new Date().toISOString(),
        payload: e.payload,
      })));
    }

    return c.json({
      ...run,
      instance_id: runIdToInstanceId(run.run_id),
      steps,
      journal_replay,
    });
  });

  app.get("/v1/runs/:run_id/graph", async (c) => {
    const run_id = c.req.param("run_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireCapability(auth, "space:read", await caps(ctx, auth));
    if (scopeCheck) return scopeCheck;

    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id.startsWith("ins_") ? run_id.slice(4) : run_id;
    const row = await murrmurePersistence.getRun(bare);
    if (!row) return c.json({ code: "run_not_found", message: "Run not found" }, 404);

    const steps = await murrmurePersistence.listRunStepMemos(`run_${bare}`);
    const entry = row.flow_id ? await murrmurePersistence.getFlowIndexEntry(row.flow_id, row.space_id) : null;

    let ir = entry?.ir;
    let pendingFlowId: string | undefined;
    if (!ir && row.exec_context._orchestration_pending) {
      const pendingGate = (await murrmurePersistence.listGatesByRun(bare)).find(
        (g) => g.status === "pending" && isOrchestrationGate(g),
      );
      const pending = pendingGate ? parseOrchestrationPayloadRef(pendingGate.payload_ref) : null;
      if (pending) {
        ir = compileFlowIr(pending.manifest, pending.flow_id);
        pendingFlowId = pending.flow_id;
      }
    }

    const sessionRuns = await murrmurePersistence.listRunsBySession(row.session_id);
    const siblings = sessionRuns
      .filter((r) => r.run_id !== bare && r.exec_context._parent_run_id)
      .map((r) => ({
        run_id: `run_${r.run_id}`,
        lifecycle: r.lifecycle,
        matrix_index: r.exec_context._matrix_index as number | undefined,
        matrix_step_id: r.exec_context._matrix_step_id as string | undefined,
        exec_context: r.exec_context,
      }));

    const { buildRunGraph } = await import("@murrmure/hub-core");
    const graph = buildRunGraph({
      run_id: `run_${bare}`,
      flow_id: row.flow_id ?? pendingFlowId,
      flow_digest: row.flow_digest ?? ir?.digest,
      ir,
      step_memos: steps,
      siblings,
    });

    return c.json(graph);
  });

  app.post("/v1/runs/:run_id/cancel", async (c) => {
    const run_id = c.req.param("run_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    const scopeCheck = requireCapability(auth, "gate:resolve", effective);
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json().catch(() => ({}));
    const result = await cancelRun(deps(), {
      run_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      space_id: body.space_id ? prefixedSpaceId(bareSpaceId(String(body.space_id))) : undefined,
    });
    if ("error" in result) {
      const err = result.error ?? { code: "UNKNOWN", message: "Request failed" };
      const status = err.code === "RUN_TERMINAL" ? 409 : 404;
      return c.json(err, status);
    }

    const broadcastSpaceId = body.space_id
      ? prefixedSpaceId(bareSpaceId(String(body.space_id)))
      : result.run.space_id;
    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: JOURNAL_EVENT_TYPES.RUN_FAILED,
        ...(broadcastSpaceId ? { space_id: broadcastSpaceId } : {}),
        session_id: result.run.session_id,
        run_id: result.run.run_id,
        reason: "cancelled",
      },
    });

    return c.json(result.run);
  });

  app.post("/v1/runs/:run_id/steps/:step_id/complete", async (c) => {
    const run_id = c.req.param("run_id");
    const step_id = c.req.param("step_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    const scopeCheck = requireCapability(auth, "action:invoke", effective);
    if (scopeCheck) return scopeCheck;

    const body = ActionCompleteBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ code: "INVALID_BODY", message: "Complete body failed validation" }, 400);
    }

    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const run = await murrmurePersistence.getRun(bare);
    if (!run) {
      return c.json({ code: "RUN_NOT_FOUND", message: "Run not found" }, 404);
    }

    const space_id = run.space_id ? prefixedSpaceId(run.space_id) : prefixedSpaceId(bareSpaceId(auth.space_id));

    const journal = {
      append: async (input: {
        type: string;
        space_id: string;
        session_id?: string;
        run_id?: string;
        step_id?: string;
        actor_id: string;
        token_id: string;
        data: Record<string, unknown>;
      }) => {
        await handler.appendSpaceJournal({
          type: input.type,
          space_id: input.space_id,
          session_id: input.session_id,
          run_id: input.run_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
          data: {
            ...input.data,
            step_id: input.step_id,
          },
        });

        await projectStepMemoFromJournal(ctx, {
          run_id: input.run_id,
          step_id: input.step_id,
          type: input.type,
          ts: new Date().toISOString(),
          result:
            input.data.result && typeof input.data.result === "object"
              ? (input.data.result as Record<string, unknown>)
              : undefined,
        });
      },
    };

    const result = await completeDispatchedAction(murrmurePersistence, journal, {
      run_id,
      step_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      space_id,
      session_id: run.session_id ? `ses_${run.session_id}` : undefined,
      result: body.data.result,
    });

    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, result.http as 404 | 409);
    }

    return c.json({ ok: true, dispatch: result.outcome }, 200);
  });

  app.post("/v1/runs/:run_id/retry", async (c) => {
    const run_id = c.req.param("run_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await caps(ctx, auth);
    const scopeCheck = requireCapability(auth, "flow:run", effective);
    if (scopeCheck) return scopeCheck;

    const body = await c.req.json().catch(() => ({}));
    const result = await retryRun(deps(), {
      run_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      from_step_id: body.from_step_id,
      space_id: body.space_id ? prefixedSpaceId(bareSpaceId(String(body.space_id))) : undefined,
      capabilities: effective,
    });
    if ("error" in result) return c.json(result.error, 409);
    return c.json(result, 201);
  });
}

export async function projectStepMemoFromJournal(
  ctx: DaemonContext,
  input: {
    run_id?: string;
    step_id?: string;
    type: string;
    ts?: string;
    idempotency_key?: string;
    error_code?: string;
    executor_type?: string;
    result?: Record<string, unknown>;
  },
): Promise<void> {
  if (!input.run_id || !input.step_id) return;
  const bare = input.run_id.startsWith("run_") ? input.run_id.slice(4) : input.run_id;
  const existing = (await ctx.murrmurePersistence.listRunStepMemos(`run_${bare}`)).find(
    (m) => m.step_id === input.step_id,
  ) ?? null;
  const ts = input.ts ?? new Date().toISOString();
  const run = await ctx.murrmurePersistence.getRun(bare);
  const flowEntry =
    run?.flow_id != null
      ? await ctx.murrmurePersistence.getFlowIndexEntry(run.flow_id, run.space_id)
      : null;
  const catalog = flowStepContractCatalog(flowEntry);
  const explicitResolve = requiresExplicitResolve(catalog, input.step_id);

  let next = applyStepMemoFromJournal(existing, {
    run_id: `run_${bare}`,
    step_id: input.step_id,
    type: input.type,
    ts,
    idempotency_key: input.idempotency_key,
    error_code: input.error_code,
    executor_type: input.executor_type,
  });

  if (input.type === JOURNAL_EVENT_TYPES.ACTION_COMPLETED && explicitResolve && next) {
    next = { ...next, status: "working", completed_at: undefined };
  }

  if (
    input.type === JOURNAL_EVENT_TYPES.ACTION_COMPLETED &&
    existing?.status === "completed"
  ) {
    return;
  }

  if (next) await ctx.murrmurePersistence.upsertRunStepMemo(next);

  if (input.type === JOURNAL_EVENT_TYPES.ACTION_COMPLETED && input.result) {
    await mergeActionResultIntoRun(ctx.murrmurePersistence, {
      run_id: input.run_id,
      step_id: input.step_id,
      status: "completed",
      result: input.result,
      completed_at: ts,
    });
  } else if (
    input.type === JOURNAL_EVENT_TYPES.ACTION_FAILED ||
    input.type === JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT
  ) {
    await mergeActionResultIntoRun(ctx.murrmurePersistence, {
      run_id: input.run_id,
      step_id: input.step_id,
      status: "failed",
      completed_at: ts,
    });
  }

  const terminalTypes = [
    "mrmr.action.completed",
    "mrmr.action.failed",
    "mrmr.action.timed_out",
    "mrmr.gate.resolved",
  ];
  const skipAdvance =
    input.type === JOURNAL_EVENT_TYPES.STEP_RESOLVED ||
    (input.type === JOURNAL_EVENT_TYPES.ACTION_COMPLETED && explicitResolve);

  if (terminalTypes.includes(input.type) && !skipAdvance) {
    await maybeCompleteHeadlessRun(
      {
        studio: ctx.murrmurePersistence,
        handler: ctx.handler,
        ids: { ulid: () => ulid() },
        clock: { nowIso: () => new Date().toISOString() },
      },
      { run_id: input.run_id },
    );

    const { advanceFlowAfterStep } = await import("../../flow-advance.js");
    await advanceFlowAfterStep(ctx, {
      run_id: input.run_id,
      step_id: input.step_id,
      actor_id: "system_flow",
      token_id: "system",
    }).catch(() => undefined);
  }
}
