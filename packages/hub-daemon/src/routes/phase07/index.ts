import type { Hono } from "hono";
import { ulid } from "ulid";
import {
  createPendingGate,
  getGateById,
  listGatesForRun,
  presentGateForActor,
  resolveGate,
  getUserMe,
  patchUserMe,
  queryJournal,
  addGateId,
  addSpaceId,
  hasCapability,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { resolveTokenCapabilities } from "../config/scopes.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { broadcastSse } from "../../context.js";

function gateDeps(ctx: DaemonContext) {
  return {
    studio: ctx.murrmurePersistence,
    handler: ctx.handler,
    ids: { ulid: () => ulid() },
    clock: { nowIso: () => new Date().toISOString() },
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

export function mountGateRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;
  const deps = () => gateDeps(ctx);

  app.get("/v1/runs/:run_id/gates", async (c) => {
    const run_id = c.req.param("run_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, "space:read")) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "space:read required" }, 403);
    }

    const gates = await listGatesForRun(deps(), run_id);
    const canRead =
      auth.space_id === "bootstrap" || hasCapability(effective, "hub:admin")
        ? true
        : hasCapability(effective, "space:read");

    const presented = [];
    for (const gate of gates) {
      const row = await getGateById(deps(), gate.gate_id);
      if (!row) continue;
      const base = presentGateForActor(gate, row, {
        actor_id: auth.actor_id,
        can_read_space: canRead,
        space_name: (await murrmurePersistence.getSpace(row.space_id))?.name ??
          (await murrmurePersistence.getSpace(row.space_id))?.slug,
      });
      presented.push(base);
    }
    return c.json({ gates: presented });
  });

  app.post("/v1/gates/:gate_id/resolve", async (c) => {
    const gate_id = c.req.param("gate_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, "flow:run")) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "flow:run required" }, 403);
    }

    // Space boundary: a flow:run token may only resolve a gate in its own space.
    // Bootstrap and hub:admin tokens are privileged and may resolve cross-space.
    // resolveGate re-checks the same boundary (defense in depth).
    const gateRow = await getGateById(deps(), gate_id);
    if (!gateRow) return c.json({ code: "gate_not_found", message: "Gate not found" }, 404);
    const isPrivileged = auth.space_id === "bootstrap" || hasCapability(effective, "hub:admin");
    if (!isPrivileged && bareSpaceId(auth.space_id) !== gateRow.space_id) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "token space does not match gate space" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const disposition =
      body.disposition === "cancel"
        ? "cancel"
        : body.disposition === "continue"
          ? "continue"
          : undefined;
    const result = await resolveGate(deps(), {
      gate_id,
      disposition,
      output:
        body.output && typeof body.output === "object"
          ? (body.output as Record<string, unknown>)
          : undefined,
      decision: body.decision === "rejected" ? "rejected" : body.decision === "approved" ? "approved" : undefined,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      space_id: auth.space_id,
      resume_data: body.resume_data,
      form_values: body.form_values ?? body.form,
      can_resolve: hasCapability(effective, "flow:run"),
      capabilities: effective,
    });

    if (result.error) {
      const status = result.error.code === "gate_not_found" ? 404 : result.error.code === "SCOPE_ENFORCEMENT_FAILURE" ? 403 : 409;
      return c.json(result.error, status);
    }

    broadcastSse(ctx, {
      event: "gate.resolved",
      data: {
        gate_id,
        disposition: body.disposition ?? (body.decision === "rejected" ? "cancel" : "continue"),
        decision: body.decision ?? "approved",
      },
    });
    broadcastSse(ctx, {
      event: "notification.changed",
      data: { gate_id },
    });

    return c.json({ gate: result.gate });
  });

  app.get("/v1/gates/wait", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, "space:read")) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "space:read required" }, 403);
    }

    const run_id = c.req.query("run_id");
    const session_id = c.req.query("session_id");
    const timeoutMs = Math.min(Number(c.req.query("timeout_ms") ?? "30000"), 120_000);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const pending = await murrmurePersistence.listPendingGates({
        run_id: run_id ?? undefined,
        session_id: session_id ?? undefined,
      });
      if (pending.length > 0) {
        return c.json({
          gates: pending.map((g) => ({
            gate_id: addGateId(g.gate_id),
            run_id: `run_${g.run_id}`,
            session_id: `ses_${g.session_id}`,
            status: g.status,
          })),
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    return c.json({ gates: [], timed_out: true });
  });

  app.post("/v1/runs/:run_id/gates", async (c) => {
    const run_id = c.req.param("run_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, ["flow:run", "hub:admin"])) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "flow:run required" }, 403);
    }

    const body = await c.req.json();
    const runBare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const run = await murrmurePersistence.getRun(runBare);
    if (!run) return c.json({ code: "run_not_found", message: "Run not found" }, 404);

    let gate;
    try {
      gate = await createPendingGate(deps(), {
        run_id,
        session_id: body.session_id ?? `ses_${run.session_id}`,
        space_id: body.space_id ?? prefixedSpaceId(run.space_id ?? auth.space_id),
        step_id: String(body.step_id ?? "gate:review"),
        assignees: body.assignees,
        form: body.form,
        action_name: body.action_name,
        expires_at: body.expires_at,
        actor_id: auth.actor_id,
        token_id: auth.token_id,
      });
    } catch (err) {
      return c.json({ code: "GATE_CREATE_FAILED", message: err instanceof Error ? err.message : String(err) }, 500);
    }

    broadcastSse(ctx, {
      event: "gate.pending",
      data: { gate_id: gate.gate_id, run_id, assignees: body.assignees ?? [] },
    });
    broadcastSse(ctx, {
      event: "notification.changed",
      data: { gate_id: gate.gate_id },
    });

    return c.json({ gate }, 201);
  });
}

export function mountNotificationRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/notifications", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    const status = c.req.query("status") as "pending" | "dismissed" | "resolved" | undefined;
    const rows = await murrmurePersistence.listNotifications(auth.actor_id, { status });
    return c.json({
      notifications: rows.map((n) => ({
        notification_id: n.notification_id,
        kind: n.kind,
        status: n.status,
        gate_id: n.gate_id ? addGateId(n.gate_id) : undefined,
        step_id: n.step_id,
        run_id: n.run_id ? `run_${n.run_id}` : undefined,
        session_id: n.session_id ? `ses_${n.session_id}` : undefined,
        space_id: addSpaceId(n.space_id),
        space_hidden: Boolean(n.space_hidden),
        title: n.title,
        summary: n.summary,
        expires_at: n.expires_at,
        created_at: n.created_at,
      })),
      pending_count: await murrmurePersistence.countPendingNotifications(auth.actor_id),
    });
  });

  app.post("/v1/notifications/:notification_id/dismiss", async (c) => {
    const notification_id = c.req.param("notification_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;

    await murrmurePersistence.dismissNotification(
      notification_id,
      auth.actor_id,
      new Date().toISOString(),
    );
    return c.json({ notification_id, status: "dismissed" });
  });
}

export function mountMeRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/me", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const profile = await getUserMe(murrmurePersistence, auth.actor_id);
    return c.json(profile);
  });

  app.patch("/v1/me", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const body = await c.req.json();
    const profile = await patchUserMe(murrmurePersistence, auth.actor_id, {
      landing_space_id: body.landing_space_id,
      notify_email: body.notify_email,
      notify_desktop: body.notify_desktop,
    });
    return c.json(profile);
  });

  app.post("/v1/notifications/test", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, "hub:admin")) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "hub:admin required" }, 403);
    }
    const result = await ctx.outOfShellService.sendTestNotification(auth.actor_id);
    return c.json({ ok: true, ...result });
  });
}

export function mountJournalQueryRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/journal", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, "journal:read")) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "journal:read required" }, 403);
    }

    const entries = await queryJournal(murrmurePersistence, {
      subject: c.req.query("subject") ?? undefined,
      type: c.req.query("type") ?? undefined,
      session_id: c.req.query("session") ?? c.req.query("session_id") ?? undefined,
      space_id: c.req.query("space_id") ?? undefined,
      since: c.req.query("since") ?? undefined,
      until: c.req.query("until") ?? undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    });

    if (auth.space_id !== "bootstrap" && !hasCapability(effective, "hub:admin")) {
      const allowedSpace = prefixedSpaceId(bareSpaceId(auth.space_id));
      const filtered = entries.filter((e) => e.space_id === allowedSpace);
      return c.json({ entries: filtered });
    }

    return c.json({ entries });
  });

  app.get("/v1/runs/wait", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    if (!hasCapability(effective, "space:read")) {
      return c.json({ code: "SCOPE_ENFORCEMENT_FAILURE", message: "space:read required" }, 403);
    }

    const run_id = c.req.query("run_id");
    if (!run_id) return c.json({ code: "INVALID_REQUEST", message: "run_id required" }, 400);

    const timeoutMs = Math.min(Number(c.req.query("timeout_ms") ?? "30000"), 120_000);
    const deadline = Date.now() + timeoutMs;
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;

    while (Date.now() < deadline) {
      const run = await murrmurePersistence.getRun(bare);
      if (!run) return c.json({ code: "run_not_found", message: "Run not found" }, 404);
      if (["completed", "failed", "cancelled"].includes(run.lifecycle)) {
        return c.json({
          run_id: `run_${bare}`,
          lifecycle: run.lifecycle,
          terminal: true,
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    const run = await murrmurePersistence.getRun(bare);
    return c.json({
      run_id: `run_${bare}`,
      lifecycle: run?.lifecycle ?? "working",
      timed_out: true,
    });
  });
}
