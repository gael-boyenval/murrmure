import type { HubHandler } from "@murrmure/hub-core";
import {
  buildIndexStatus,
  buildEmittableEventsCatalog,
  validateEmitPayload,
} from "@murrmure/hub-core";
import { HandlerSpecSchema } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import type { McpToolRegistry } from "./mcp-tool-registry.js";
import type { DaemonConfig } from "./context.js";
import type { TokenContext } from "./auth.js";

export function registerPlatformMcpHandlers(
  registry: McpToolRegistry,
  handler: HubHandler,
  config: DaemonConfig,
  studio: StudioPersistencePort,
  ctx: { invokeService: import("./invoke-service.js").InvokeService },
): void {
  const hubUrl = () => `http://127.0.0.1:${config.port}`;

  registry.registerHandler("query_ask", async (args, ctx) => {
    const sourceSpaceId = resolveSpaceId(ctx, config);
    const res = await fetch(`${hubUrl()}/v1/spaces/${sourceSpaceId}/queries/ask`, {
      method: "POST",
      headers: mcpHeaders(ctx),
      body: JSON.stringify({
        target_space_id: args.target_space_id,
        query_type: args.query_type,
        params: args.params ?? {},
        timeout_ms: args.timeout_ms,
      }),
    });
    return assertHttpOk(res, "Query ask");
  });

  registry.registerHandler("murrmure_space_status", async (args, ctx) => {
    const spaceId = resolveTargetSpaceId(ctx, config, args.space_id);
    const bare = bareSpaceId(spaceId);
    const snapshot = await studio.getSpaceIndexSnapshot(bare);
    const bindings = await studio.getSpaceBindings(bare);
    return {
      space_id: prefixedSpaceId(bare),
      bindings,
      ...buildIndexStatus(snapshot),
    };
  });

  registry.registerHandler("murrmure_space_health", async (args, authCtx) => {
    const spaceId = resolveTargetSpaceId(authCtx, config, args.space_id);
    const bare = bareSpaceId(spaceId);
    const snapshot = await studio.getSpaceIndexSnapshot(bare);
    const bindings = await studio.getSpaceBindings(bare);
    const hooks = await studio.listIndexedHooks(bare);
    const handlers = hooks
      .map((row) => HandlerSpecSchema.safeParse(row))
      .filter((parsed): parsed is { success: true; data: import("@murrmure/contracts").HandlerSpec } => parsed.success)
      .map((parsed) => parsed.data);
    const index = buildIndexStatus(snapshot);
    const warnings: string[] = [];
    if (index.counts.flows === 0) warnings.push("No indexed flows");
    if (handlers.length === 0) warnings.push("No indexed handlers");

    return {
      space_id: prefixedSpaceId(bare),
      index,
      handlers: {
        count: handlers.length,
        contract_key_count: handlers.reduce((count, handler) => count + (handler.contract_keys?.length ?? 0), 0),
      },
      bindings,
      healthy: warnings.length === 0,
      warnings,
    };
  });

  registry.registerHandler("murrmure_apply_space", async (args, ctx) => {
    const spaceId = resolveTargetSpaceId(ctx, config, args.space_id);
    const res = await fetch(`${hubUrl()}/v1/spaces/${prefixedSpaceId(bareSpaceId(spaceId))}/apply`, {
      method: "POST",
      headers: mcpHeaders(ctx),
      body: JSON.stringify({ bundle: args.bundle ?? {} }),
    });
    return assertHttpOk(res, "Apply space");
  });

  registry.registerHandler("murrmure_grant_mint", async (args, ctx) => {
    const spaceId = resolveTargetSpaceId(ctx, config, args.space_id);
    const res = await fetch(`${hubUrl()}/v1/spaces/${prefixedSpaceId(bareSpaceId(spaceId))}/grants`, {
      method: "POST",
      headers: mcpHeaders(ctx),
      body: JSON.stringify({
        label: args.label ?? "mcp-agent",
        harness: args.harness,
        scopes: args.capabilities ?? args.scopes,
        flow_acl: args.flow_acl,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.message === "string" ? data.message : `Grant mint failed (${res.status})`,
      );
    }
    return data;
  });

  registry.registerHandler("murrmure_list_emittable_events", async (args, authCtx) => {
    const spaceId = resolveTargetSpaceId(authCtx, config, args.space_id);
    return buildEmittableEventsCatalog(studio, bareSpaceId(spaceId));
  });

  registry.registerHandler("murrmure_list_handlers", async (args, authCtx) => {
    const spaceId = resolveTargetSpaceId(authCtx, config, args.space_id);
    const bare = bareSpaceId(spaceId);
    const rows = await studio.listIndexedHooks(bare);
    const handlers: Array<{ id: string; contract_keys: string[]; type: string }> = [];
    for (const row of rows) {
      const parsed = HandlerSpecSchema.safeParse(row);
      if (!parsed.success) continue;
      handlers.push({
        id: parsed.data.id,
        contract_keys: parsed.data.contract_keys ?? [],
        type: parsed.data.type,
      });
    }
    return {
      space_id: prefixedSpaceId(bare),
      handlers,
    };
  });

  registry.registerHandler("murrmure_emit_event", async (args, authCtx) => {
    const spaceId = resolveTargetSpaceId(authCtx, config, args.space_id);
    const bare = bareSpaceId(spaceId);
    const prefixed = prefixedSpaceId(bare);
    const eventType = String(args.event_type ?? args.type ?? "");
    if (!eventType) {
      throw new Error("event_type is required");
    }

    const catalog = await buildEmittableEventsCatalog(studio, bare);
    const entry = catalog.events.find((e) => e.event_type === eventType);
    const source = `/spaces/${prefixed}`;
    const rawPayload =
      args.payload != null && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};

    const validationError = validateEmitPayload(entry, rawPayload);
    if (validationError) {
      throw new Error(validationError);
    }

    const space = await studio.getSpace(bare);
    const payload = {
      ...rawPayload,
      source: typeof rawPayload.source === "string" ? rawPayload.source : source,
      repo: rawPayload.repo ?? space?.slug ?? bare,
    };

    const res = await fetch(`${hubUrl()}/v1/spaces/${prefixed}/events`, {
      method: "POST",
      headers: mcpHeaders(authCtx),
      body: JSON.stringify({
        event_type: eventType,
        event_id: args.event_id,
        payload,
      }),
    });
    const data = await assertHttpOk(res, "Emit event");
    return { ...data, source, repo: payload.repo };
  });

  registry.registerHandler("murrmure_resolve_step", async (args, authCtx) => {
    const run_id = String(args.run_id ?? "");
    const step_id = String(args.step_id ?? "");
    const branch = String(args.branch ?? "");
    if (!run_id || !step_id || !branch) {
      throw new Error("run_id, step_id, and branch are required");
    }

    const res = await fetch(
      `${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}/steps/${encodeURIComponent(step_id)}/resolve`,
      {
        method: "POST",
        headers: mcpHeaders(authCtx),
        body: JSON.stringify({
          branch,
          payload: args.payload ?? {},
          artifacts_out: args.artifacts_out,
          upload_intent_id: args.upload_intent_id,
          idempotency_key: args.idempotency_key,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(JSON.stringify({
        code: typeof data.code === "string" ? data.code : "RESOLVE_FAILED",
        message: typeof data.message === "string" ? data.message : `Resolve step failed (${res.status})`,
        ...(Array.isArray(data.errors) ? { errors: data.errors } : {}),
      }));
    }
    return data;
  });

  registry.registerHandler("murrmure_open_child_step", async (args, authCtx) => {
    const run_id = String(args.run_id ?? "");
    const parent_step_id = String(args.parent_step_id ?? "");
    const child_step_id = String(args.child_step_id ?? "");
    const idempotency_key = String(args.idempotency_key ?? "");
    if (!run_id || !parent_step_id || !child_step_id || !idempotency_key) {
      throw new Error("run_id, parent_step_id, child_step_id, and idempotency_key are required");
    }
    const res = await fetch(
      `${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}/steps/${encodeURIComponent(parent_step_id)}/children/open`,
      {
        method: "POST",
        headers: mcpHeaders(authCtx),
        body: JSON.stringify({ child_step_id, idempotency_key }),
      },
    );
    return assertHttpOk(res, "Open child step");
  });

  registry.registerHandler("murrmure_create_session", async (args, authCtx) => {
    const res = await fetch(`${hubUrl()}/v1/sessions`, {
      method: "POST",
      headers: mcpHeaders(authCtx),
      body: JSON.stringify({
        title: args.title ?? "MCP session",
        subject: args.subject,
        space_id: resolveTargetSpaceId(authCtx, config, args.space_id),
      }),
    });
    return assertHttpOk(res, "Create session");
  });

  registry.registerHandler("murrmure_list_sessions", async (args, authCtx) => {
    const params = new URLSearchParams();
    if (args.status) params.set("status", String(args.status));
    if (args.space_id) params.set("space_id", String(args.space_id));
    const res = await fetch(`${hubUrl()}/v1/sessions?${params}`, { headers: mcpHeaders(authCtx) });
    return assertHttpOk(res, "List sessions");
  });

  registry.registerHandler("murrmure_get_session", async (args, authCtx) => {
    const session_id = String(args.session_id ?? "");
    const res = await fetch(`${hubUrl()}/v1/sessions/${encodeURIComponent(session_id)}`, {
      headers: mcpHeaders(authCtx),
    });
    return assertHttpOk(res, "Get session");
  });

  registry.registerHandler("murrmure_create_run", async (args, authCtx) => {
    const session_id = String(args.session_id ?? "");
    const res = await fetch(`${hubUrl()}/v1/sessions/${encodeURIComponent(session_id)}/runs`, {
      method: "POST",
      headers: mcpHeaders(authCtx),
      body: JSON.stringify({
        flow_id: args.flow_id ?? null,
        input: args.input ?? args.params,
        space_id: resolveTargetSpaceId(authCtx, config, args.space_id),
        reference_run_ids: args.reference_run_ids,
      }),
    });
    return assertHttpOk(res, "Create run");
  });

  registry.registerHandler("murrmure_get_run", async (args, _authCtx) => {
    const run_id = String(args.run_id ?? args.instance_id ?? "");
    const res = await fetch(`${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}`, {
      headers: mcpHeaders(_authCtx),
    });
    return assertHttpOk(res, "Get run");
  });

  registry.registerHandler("murrmure_get_run_context", async (args, authCtx) => {
    const run_id = String(args.run_id ?? args.instance_id ?? "");
    if (!run_id) throw new Error("run_id is required");

    const runRes = await fetch(`${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}`, {
      headers: mcpHeaders(authCtx),
    });
    const run = await assertHttpOk(runRes, "Get run context");

    const contractsRes = await fetch(`${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}/step-contracts`, {
      headers: mcpHeaders(authCtx),
    });
    let step_contracts: Record<string, unknown> | null = null;
    if (contractsRes.ok) {
      step_contracts = await parseHttpJson(contractsRes);
    } else if (contractsRes.status !== 404 && contractsRes.status !== 409) {
      const body = await parseHttpJson(contractsRes);
      throw httpProxyError(contractsRes, body, "Get run context contracts");
    }

    return {
      run,
      step_contracts,
    };
  });

  registry.registerHandler("murrmure_get_run_graph", async (args, authCtx) => {
    const run_id = String(args.run_id ?? args.instance_id ?? "");
    const res = await fetch(`${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}/graph`, {
      headers: mcpHeaders(authCtx),
    });
    return assertHttpOk(res, "Get run graph");
  });

  registry.registerHandler("murrmure_list_step_contracts", async (args, authCtx) => {
    const run_id = String(args.run_id ?? args.instance_id ?? "");
    if (!run_id) throw new Error("run_id is required");
    const res = await fetch(`${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}/step-contracts`, {
      headers: mcpHeaders(authCtx),
    });
    return assertHttpOk(res, "List step contracts");
  });

  registry.registerHandler("murrmure_attach_orchestration", async (args, authCtx) => {
    const session_id = String(args.session_id ?? "");
    if (!session_id) throw new Error("session_id is required");
    const res = await fetch(`${hubUrl()}/v1/sessions/${encodeURIComponent(session_id)}/orchestration/attach`, {
      method: "POST",
      headers: mcpHeaders(authCtx),
      body: JSON.stringify({
        kind: "murrmure.flow.attach/v1",
        manifest: args.manifest,
        space_id: resolveTargetSpaceId(authCtx, config, args.space_id),
        breakglass: args.breakglass,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.message === "string" ? data.message : `Attach orchestration failed (${res.status})`,
      );
    }
    return data;
  });

  registry.registerHandler("murrmure_cancel_run", async (args, authCtx) => {
    const run_id = String(args.run_id ?? args.instance_id ?? "");
    const res = await fetch(`${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}/cancel`, {
      method: "POST",
      headers: mcpHeaders(authCtx),
      body: JSON.stringify({ space_id: args.space_id }),
    });
    return assertHttpOk(res, "Cancel run");
  });

  registry.registerHandler("murrmure_wait_for_run", async (args, authCtx) => {
    const params = new URLSearchParams();
    const run_id = args.run_id ?? args.instance_id;
    if (run_id != null && String(run_id).length > 0) {
      params.set("run_id", String(run_id));
    }
    if (args.timeout_ms) params.set("timeout_ms", String(args.timeout_ms));
    const res = await fetch(`${hubUrl()}/v1/runs/wait?${params}`, { headers: mcpHeaders(authCtx) });
    return assertHttpOk(res, "Wait for run");
  });

  registry.registerHandler("murrmure_journal_query", async (args, authCtx) => {
    const params = new URLSearchParams();
    for (const key of ["subject", "type", "session", "session_id", "space_id", "since", "until", "limit"]) {
      if (args[key] != null) params.set(key === "session" ? "session" : key, String(args[key]));
    }
    const res = await fetch(`${hubUrl()}/v1/journal?${params}`, { headers: mcpHeaders(authCtx) });
    return assertHttpOk(res, "Journal query");
  });
}

function resolveSpaceId(ctx: TokenContext, config: DaemonConfig): string {
  if (ctx.space_id !== "bootstrap") return prefixedSpaceId(bareSpaceId(ctx.space_id));
  const env = config.defaultSpaceId || process.env.MURRMURE_SPACE_ID || "";
  return env.startsWith("spc_") ? env : prefixedSpaceId(env);
}

function resolveTargetSpaceId(
  ctx: TokenContext,
  config: DaemonConfig,
  argsSpaceId?: unknown,
): string {
  const requested =
    argsSpaceId != null && String(argsSpaceId).length > 0
      ? prefixedSpaceId(bareSpaceId(String(argsSpaceId)))
      : undefined;

  if (ctx.space_id === "bootstrap") {
    return requested ?? resolveSpaceId(ctx, config);
  }

  const authSpace = prefixedSpaceId(bareSpaceId(ctx.space_id));
  if (requested && bareSpaceId(requested) !== bareSpaceId(authSpace)) {
    throw new Error("Token not valid for this space or action");
  }
  return authSpace;
}

function mcpHeaders(ctx: TokenContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ctx.token_id}`,
  };
}

async function parseHttpJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function httpProxyError(res: Response, data: Record<string, unknown>, label: string): Error {
  return new Error(
    typeof data.message === "string"
      ? data.message
      : typeof data.code === "string"
        ? `${data.code} (${res.status})`
        : `${label} failed (${res.status})`,
  );
}

async function assertHttpOk(res: Response, label: string): Promise<Record<string, unknown>> {
  const data = await parseHttpJson(res);
  if (!res.ok) throw httpProxyError(res, data, label);
  return data;
}
