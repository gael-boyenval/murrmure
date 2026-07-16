import type { Hono } from "hono";
import { ulid } from "ulid";
import { buildEmittableEventsCatalog } from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope } from "../config/scopes.js";
import {
  expandFromTemplate,
  listTemplates,
  normalizeTriggerDedup,
  TriggerActionRejectedError,
  assertTriggerActionAccepted,
} from "../../lib/triggers-templates.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";

export { TriggerActionRejectedError } from "../../lib/triggers-templates.js";

function isRetiredActionError(e: unknown): boolean {
  return (
    e instanceof TriggerActionRejectedError ||
    (e instanceof Error && (e as { code?: string }).code === "TRIGGER_ACTION_RETIRED")
  );
}

export function mountTriggerRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence, handler, triggerDispatcher } = ctx;

  app.get("/v1/spaces/:space_id/triggers/event-catalog", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const catalog = await buildEmittableEventsCatalog(murrmurePersistence, bareSpaceId(space_id));
    const events = catalog.events.map((entry) => ({
      type: entry.event_type,
      package_id: entry.listeners[0]?.flow_id ?? null,
      description: entry.description,
      payload_schema_summary: entry.payload_schema?.required?.length
        ? { required: entry.payload_schema.required }
        : undefined,
      origins: entry.origins,
    }));

    return c.json({ events });
  });

  app.get("/v1/spaces/:space_id/triggers/templates", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    return c.json({ templates: listTemplates() });
  });

  app.post("/v1/spaces/:space_id/triggers/from-template", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "trigger:register");
    if (scopeCheck) return scopeCheck;

    let expanded;
    try {
      expanded = expandFromTemplate({
        template_id: String(body.template_id ?? ""),
        name: body.name as string | undefined,
        source_space_id: String(body.source_space_id ?? ""),
        target_space_id: String(body.target_space_id ?? space_id),
      });
    } catch (e) {
      if (isRetiredActionError(e)) {
        return c.json(
          { code: "TRIGGER_ACTION_RETIRED", message: e instanceof Error ? e.message : "trigger action retired" },
          422,
        );
      }
      const message = e instanceof Error ? e.message : "from-template failed";
      const status = message.startsWith("UNKNOWN_TEMPLATE:") ? 404 : 422;
      return c.json({ code: status === 404 ? "UNKNOWN_TEMPLATE" : "FROM_TEMPLATE_FAILED", message }, status);
    }

    try {
      const trigger = await handler.config.registerTrigger(space_id, expanded);
      return c.json(trigger, 201);
    } catch (e) {
      if (isRetiredActionError(e)) {
        return c.json(
          { code: "TRIGGER_ACTION_RETIRED", message: e instanceof Error ? e.message : "trigger action retired" },
          422,
        );
      }
      throw e;
    }
  });

  app.post("/v1/spaces/:space_id/triggers/:trigger_id/test-fire", async (c) => {
    const space_id = c.req.param("space_id");
    const trigger_id = c.req.param("trigger_id");
    const body = await c.req.json();
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "trigger:register");
    if (scopeCheck) return scopeCheck;

    const synthetic = {
      event_id: String(body.source_event_id ?? `evt_${ulid()}`),
      event_type: String(body.event_type ?? "spec.published"),
      space_id: prefixedSpaceId(String(body.source_space_id ?? space_id).replace(/^spc_/, "")),
      payload: (body.payload as Record<string, unknown>) ?? {
        spec_key: "ins_test_fire",
        title: "Test fire",
        version: 1,
        summary: "Synthetic test event",
      },
    };

    const result = await triggerDispatcher.replayTrigger(space_id, trigger_id, synthetic, true);
    return c.json({ ok: true, ...result });
  });
}

export function normalizeTriggerBody(body: Record<string, unknown>): Record<string, unknown> {
  const action = (body.action as Record<string, unknown>) ?? {};
  // Reject retired trigger actions at the custom register boundary (strict).
  assertTriggerActionAccepted(action);
  const dedup = normalizeTriggerDedup(body.dedup as Record<string, unknown> | undefined);
  return {
    ...body,
    action,
    dedup,
  };
}
