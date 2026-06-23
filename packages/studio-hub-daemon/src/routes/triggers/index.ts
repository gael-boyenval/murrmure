import type { Hono } from "hono";
import { ulid } from "ulid";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireScope } from "../config/scopes.js";
import {
  buildEventCatalog,
  expandFromTemplate,
  listTemplates,
  normalizeTriggerAction,
  normalizeTriggerDedup,
} from "@murrmure/triggers-templates";
import { prefixedSpaceId } from "../../space-id.js";

export function mountTriggerRoutes(app: Hono, ctx: DaemonContext): void {
  const { studioPersistence, handler, triggerDispatcher } = ctx;

  app.get("/v1/spaces/:space_id/triggers/event-catalog", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const mounts = ctx.mountRegistry.getRoutes(space_id).map((m) => {
      const live = ctx.mountRegistry.getMount(space_id, m.package_id);
      return {
        package_id: m.package_id,
        semver: m.semver,
        contract_ref_id: live?.contract_ref_id,
      };
    });

    const contractRefs = ["cref_feature_spec", "cref_review_loop", "cref_linear_demo"];
    const contracts = [];
    for (const ref of contractRefs) {
      const row = await studioPersistence.getContractRef(ref);
      if (row) contracts.push({ contract_ref_id: ref, contract: row.contract });
    }

    return c.json({ events: buildEventCatalog(mounts, contracts) });
  });

  app.get("/v1/spaces/:space_id/triggers/templates", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    return c.json({ templates: listTemplates() });
  });

  app.post("/v1/spaces/:space_id/triggers/from-template", async (c) => {
    const space_id = c.req.param("space_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "trigger:register");
    if (scopeCheck) return scopeCheck;

    const expanded = expandFromTemplate({
      template_id: String(body.template_id ?? ""),
      name: body.name as string | undefined,
      source_space_id: String(body.source_space_id ?? ""),
      target_space_id: String(body.target_space_id ?? space_id),
      wake_label: body.wake_label as string | undefined,
    });

    const trigger = await handler.config.registerTrigger(space_id, expanded);
    return c.json(trigger, 201);
  });

  app.post("/v1/spaces/:space_id/triggers/:trigger_id/test-fire", async (c) => {
    const space_id = c.req.param("space_id");
    const trigger_id = c.req.param("trigger_id");
    const body = await c.req.json();
    const auth = await requireToken(studioPersistence, c.req.raw, space_id);
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
  const action = normalizeTriggerAction((body.action as Record<string, unknown>) ?? {});
  const dedup = normalizeTriggerDedup(body.dedup as Record<string, unknown> | undefined);
  return {
    ...body,
    action,
    dedup,
  };
}
