import type { Hono } from "hono";
import {
  ExecutorTaskCompleteBodySchema,
  ExecutorTaskFailBodySchema,
} from "@murrmure/contracts";
import {
  canPollExecutor,
  completeQueuedTask,
  failQueuedTask,
  type ExecutorPollStore,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { resolveTokenCapabilities, requireCapability } from "../config/scopes.js";
import { projectStepMemoFromJournal } from "../sessions/index.js";

const DEFAULT_POLL_TIMEOUT_MS = 30_000;

export function mountExecutorPollRoutes(
  app: Hono,
  ctx: DaemonContext,
  store: ExecutorPollStore,
): void {
  const { murrmurePersistence, handler } = ctx;

  app.get("/v1/executor/tasks", async (c) => {
    const executor_id = c.req.query("executor_id");
    if (!executor_id) {
      return c.json({ code: "INVALID_REQUEST", message: "executor_id query required" }, 400);
    }

    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "executor:poll", effective);
    if (capCheck) return capCheck;
    if (
      !canPollExecutor(
        { space_id: auth.space_id, harness_id: auth.harness_id, capabilities: effective },
        executor_id,
      )
    ) {
      return c.json(
        {
          code: "SCOPE_ENFORCEMENT_FAILURE",
          message: `Token not authorized to poll executor '${executor_id}'`,
        },
        403,
      );
    }

    const timeoutRaw = c.req.query("timeout_ms");
    const timeout_ms = timeoutRaw ? Number(timeoutRaw) : DEFAULT_POLL_TIMEOUT_MS;
    const tasks = await store.poll(executor_id, Number.isFinite(timeout_ms) ? timeout_ms : DEFAULT_POLL_TIMEOUT_MS);
    return c.json(tasks, 200);
  });

  app.get("/v1/executor/poll-status", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:read", effective);
    if (capCheck && auth.space_id !== "bootstrap") return capCheck;

    const executors = store.listExecutorIds().map((executor_id) => ({
      executor_id,
      last_poll_at: store.lastPollAt(executor_id),
      reachable: store.isReachable(executor_id),
      pending_tasks: store.pendingCount(executor_id),
    }));
    return c.json({ executors }, 200);
  });

  async function journalWriter(actor_id: string, token_id: string) {
    return {
      append: async (input: {
        type: string;
        space_id: string;
        session_id?: string;
        run_id?: string;
        step_id?: string;
        data: Record<string, unknown>;
      }) => {
        await handler.appendSpaceJournal({
          type: input.type,
          space_id: input.space_id,
          session_id: input.session_id,
          run_id: input.run_id,
          actor_id,
          token_id,
          data: {
            ...input.data,
            step_id: input.step_id,
          },
        });

        await projectStepMemoFromJournal(ctx, {
          run_id: input.run_id,
          step_id: input.step_id,
          type: input.type,
          error_code:
            typeof input.data.error_code === "string" ? input.data.error_code : undefined,
        });
      },
    };
  }

  app.post("/v1/executor/tasks/:task_id/complete", async (c) => {
    const task_id = c.req.param("task_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "executor:poll", effective);
    if (capCheck) return capCheck;

    const record = store.get(task_id);
    if (
      record &&
      !canPollExecutor(
        { space_id: auth.space_id, harness_id: auth.harness_id, capabilities: effective },
        record.executor_id,
      )
    ) {
      return c.json(
        {
          code: "SCOPE_ENFORCEMENT_FAILURE",
          message: "Token not authorized for this task executor",
        },
        403,
      );
    }

    const body = ExecutorTaskCompleteBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ code: "INVALID_BODY", message: "Complete body failed validation" }, 400);
    }

    const journal = await journalWriter(auth.actor_id, auth.token_id);
    const result = await completeQueuedTask(store, journal, {
      task_id,
      result: body.data.result,
    });
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, result.http as 404 | 409);
    }

    return c.json({ ok: true, dispatch: result.outcome }, 200);
  });

  app.post("/v1/executor/tasks/:task_id/fail", async (c) => {
    const task_id = c.req.param("task_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "executor:poll", effective);
    if (capCheck) return capCheck;

    const record = store.get(task_id);
    if (
      record &&
      !canPollExecutor(
        { space_id: auth.space_id, harness_id: auth.harness_id, capabilities: effective },
        record.executor_id,
      )
    ) {
      return c.json(
        {
          code: "SCOPE_ENFORCEMENT_FAILURE",
          message: "Token not authorized for this task executor",
        },
        403,
      );
    }

    const body = ExecutorTaskFailBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ code: "INVALID_BODY", message: "Fail body failed validation" }, 400);
    }

    const journal = await journalWriter(auth.actor_id, auth.token_id);
    const result = await failQueuedTask(store, journal, {
      task_id,
      error_code: body.data.error_code,
      detail: body.data.detail,
    });
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, result.http as 404 | 409);
    }

    return c.json({ ok: true }, 200);
  });
}

/** Bootstrap / internal poll without auth — dev/tests only. */
export function mountDevExecutorPollAdapter(
  app: Hono,
  ctx: DaemonContext,
  store: ExecutorPollStore,
): void {
  mountExecutorPollRoutes(app, ctx, store);
}
