import type { HubHandler } from "@murrmure/hub-core";
import {
  buildIndexStatus,
  buildEmittableEventsCatalog,
  validateEmitPayload,
} from "@murrmure/hub-core";
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

  registry.registerHandler("murrmure_invoke_action", async (args, authCtx) => {
    const spaceId = resolveTargetSpaceId(authCtx, config, args.space_id);
    const actionName = String(args.action_name ?? args.name ?? "");
    if (!actionName) {
      throw new Error("action_name is required");
    }

    const res = await fetch(
      `${hubUrl()}/v1/spaces/${prefixedSpaceId(bareSpaceId(spaceId))}/actions/${encodeURIComponent(actionName)}/invoke`,
      {
        method: "POST",
        headers: mcpHeaders(authCtx),
        body: JSON.stringify({
          session_id: args.session_id,
          run_id: args.run_id,
          step_id: args.step_id,
          params: args.params ?? {},
          expect: args.expect,
          artifacts_in: args.artifacts_in,
          delivery: args.delivery,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.message === "string"
          ? data.message
          : typeof (data.dispatch as { detail?: string } | undefined)?.detail === "string"
            ? (data.dispatch as { detail: string }).detail
            : `Invoke failed (${res.status})`,
      );
    }
    return data;
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

  registry.registerHandler("murrmure_get_run_graph", async (args, authCtx) => {
    const run_id = String(args.run_id ?? args.instance_id ?? "");
    const res = await fetch(`${hubUrl()}/v1/runs/${encodeURIComponent(run_id)}/graph`, {
      headers: mcpHeaders(authCtx),
    });
    return assertHttpOk(res, "Get run graph");
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

  registry.registerHandler("murrmure_wait_for_gate", async (args, authCtx) => {
    const params = new URLSearchParams();
    if (args.run_id) params.set("run_id", String(args.run_id));
    if (args.session_id) params.set("session_id", String(args.session_id));
    if (args.timeout_ms) params.set("timeout_ms", String(args.timeout_ms));
    const res = await fetch(`${hubUrl()}/v1/gates/wait?${params}`, { headers: mcpHeaders(authCtx) });
    return assertHttpOk(res, "Wait for gate");
  });

  registry.registerHandler("murrmure_resolve_gate", async (args, authCtx) => {
    const gate_id = String(args.gate_id ?? "");
    const res = await fetch(`${hubUrl()}/v1/gates/${encodeURIComponent(gate_id)}/resolve`, {
      method: "POST",
      headers: mcpHeaders(authCtx),
      body: JSON.stringify({
        decision: args.decision ?? "approved",
        form_values: args.form_values,
        resume_data: args.resume_data,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : `Resolve gate failed (${res.status})`);
    }
    return data;
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
