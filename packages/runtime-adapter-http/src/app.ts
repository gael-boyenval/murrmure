import { Hono } from "hono";
import type { CommandPort, KernelCommand, QueryPort } from "@runtime/contracts";
import { DENIAL_CODES, denialResult, HTTP_SEMANTIC } from "@runtime/contracts";
import { bearerCredential, commandIdFromRequest, resultToResponse } from "./errors.js";

export interface HttpAdapterDeps {
  commands: CommandPort & { rebuildProjection?: (name: string, from_seq?: number) => Promise<void> };
  queries: QueryPort;
  idempotencyBodies?: Map<string, string>;
}

export function createHttpApp(deps: HttpAdapterDeps) {
  const app = new Hono();
  const idempotencyBodies = deps.idempotencyBodies ?? new Map<string, string>();

  app.post("/v1/scopes/:scope_id/aggregates", async (c) => {
    const scope_id = c.req.param("scope_id");
    const body = await c.req.json();
    const auth = bearerCredential(c.req.raw);
    const command_id = commandIdFromRequest(c.req.raw) ?? body.command_id;
    const bodyKey = JSON.stringify(body);
    if (command_id) {
      const prior = idempotencyBodies.get(command_id);
      if (prior && prior !== bodyKey) {
        return resultToResponse(
          denialResult(DENIAL_CODES.IDEMPOTENCY_CONFLICT, { message: "Idempotency key reused with different body" }, HTTP_SEMANTIC.CONFLICT),
        );
      }
      idempotencyBodies.set(command_id, bodyKey);
    }

    const command: KernelCommand = {
      kind: "aggregate.create",
      provenance: { scope_id, ...auth, command_id },
      rule_ref: body.rule_ref,
      metadata: body.metadata,
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.get("/v1/scopes/:scope_id/aggregates/:id", async (c) => {
    const aggregate = await deps.queries.getAggregate(c.req.param("id"));
    if (!aggregate || aggregate.scope_id !== c.req.param("scope_id")) {
      return resultToResponse(denialResult(DENIAL_CODES.NOT_FOUND, { message: "Aggregate not found" }, HTTP_SEMANTIC.NOT_FOUND));
    }
    return Response.json({ aggregate }, { status: 200 });
  });

  app.post("/v1/scopes/:scope_id/aggregates/:id/transitions", async (c) => {
    const scope_id = c.req.param("scope_id");
    const body = await c.req.json();
    const auth = bearerCredential(c.req.raw);
    const command_id = commandIdFromRequest(c.req.raw) ?? body.command_id;
    const command: KernelCommand = {
      kind: "state.transition",
      provenance: { scope_id, ...auth, command_id, actor_kind: body.actor_kind },
      aggregate_id: c.req.param("id"),
      event: body.event,
      expected_revision: body.expected_revision,
      payload: body.payload,
      block_on: body.block_on,
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.post("/v1/scopes/:scope_id/checkpoints/:id/resolve", async (c) => {
    const scope_id = c.req.param("scope_id");
    const body = await c.req.json();
    const auth = bearerCredential(c.req.raw);
    const command: KernelCommand = {
      kind: "checkpoint.resolve",
      provenance: { scope_id, ...auth, command_id: body.command_id, actor_kind: body.actor_kind },
      checkpoint_id: c.req.param("id"),
      decision: body.decision,
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.post("/v1/scopes/:scope_id/events", async (c) => {
    const scope_id = c.req.param("scope_id");
    const body = await c.req.json();
    const auth = bearerCredential(c.req.raw);
    const command: KernelCommand = {
      kind: "event.append",
      provenance: { scope_id, ...auth, command_id: body.command_id },
      aggregate_id: body.aggregate_id,
      event_type: body.event_type,
      payload: body.payload,
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.get("/v1/scopes/:scope_id/journal", async (c) => {
    const from_seq = Number(c.req.query("from_seq") ?? "0");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const entries = await deps.queries.tailJournal(from_seq, limit);
    return Response.json({ entries }, { status: 200 });
  });

  app.post("/v1/scopes/:scope_id/waits", async (c) => {
    const scope_id = c.req.param("scope_id");
    const body = await c.req.json();
    const auth = bearerCredential(c.req.raw);
    const command: KernelCommand = {
      kind: "wait.register",
      provenance: { scope_id, ...auth, command_id: body.command_id, aggregate_id: body.aggregate_id },
      condition: body.condition,
      delivery_mode: "in_process",
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.get("/v1/scopes/:scope_id/waits/:id", async (c) => {
    const wait = await deps.queries.getWait(c.req.param("id"));
    if (!wait) {
      return resultToResponse(denialResult(DENIAL_CODES.NOT_FOUND, { message: "Wait not found" }, HTTP_SEMANTIC.NOT_FOUND));
    }
    return Response.json({ wait }, { status: 200 });
  });

  app.post("/v1/scopes/:scope_id/reactions", async (c) => {
    const scope_id = c.req.param("scope_id");
    const body = await c.req.json();
    const auth = bearerCredential(c.req.raw);
    const command: KernelCommand = {
      kind: "reaction.register",
      provenance: { scope_id, ...auth, command_id: body.command_id },
      spec: { ...body.spec, scope_id },
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.delete("/v1/scopes/:scope_id/reactions/:id", async (c) => {
    const scope_id = c.req.param("scope_id");
    const auth = bearerCredential(c.req.raw);
    const command: KernelCommand = {
      kind: "reaction.disable",
      provenance: { scope_id, ...auth, command_id: `disable-${c.req.param("id")}` },
      reaction_id: c.req.param("id"),
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.post("/v1/scopes/:scope_id/reactions/:id/replay", async (c) => {
    const scope_id = c.req.param("scope_id");
    const body = await c.req.json();
    const auth = bearerCredential(c.req.raw);
    const command: KernelCommand = {
      kind: "reaction.replay",
      provenance: { scope_id, ...auth, command_id: body.command_id },
      reaction_id: c.req.param("id"),
      source_entry_id: body.source_entry_id,
      bypass_dedup: body.bypass_dedup,
      reason: body.reason ?? "replay",
    };
    return resultToResponse(await deps.commands.execute(command));
  });

  app.get("/v1/scopes/:scope_id/projections/:name", async (c) => {
    const scope_id = c.req.param("scope_id");
    const aggregate_id = c.req.query("aggregate_id") ?? undefined;
    const state = await deps.queries.getProjection(c.req.param("name"), scope_id, aggregate_id);
    if (!state) {
      return resultToResponse(denialResult(DENIAL_CODES.NOT_FOUND, { message: "Projection not found" }, HTTP_SEMANTIC.NOT_FOUND));
    }
    return Response.json({ projection: state }, { status: 200 });
  });

  app.post("/v1/scopes/:scope_id/projections/:name/rebuild", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const from_seq = body.from_seq ?? 0;
    if (!deps.commands.rebuildProjection) {
      return resultToResponse(denialResult(DENIAL_CODES.NOT_FOUND, { message: "Rebuild not supported" }, HTTP_SEMANTIC.NOT_FOUND));
    }
    await deps.commands.rebuildProjection(c.req.param("name"), from_seq);
    return Response.json({ ok: true, name: c.req.param("name"), from_seq }, { status: 200 });
  });

  return app;
}
