import type { Hono } from "hono";
import {
  SpaceApplyBundleSchema,
  SpaceBindingsSchema,
  RemoteHubSpaceBindingSchema,
  JOURNAL_EVENT_TYPES,
  isLocalSpaceBinding,
  type FlowIndexEntry,
  type SpaceApplyBundle,
} from "@murrmure/contracts";
import {
  applyIndexDiff,
  buildIndexStatus,
  validateApplyBundle,
  parseFlowManifest,
  rejectInlineScriptSteps,
  lintSpaceApplyBundle,
  resolveBindingsFile,
  validateHandlerBindings,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import {
  requireCapability,
  requireInstallPolicy,
  requireScope,
  resolveTokenCapabilities,
} from "../config/scopes.js";
import { bareSpaceId, prefixedSpaceId } from "../../space-id.js";
import { markSpaceLinkForActor } from "@murrmure/hub-core";
import { broadcastSse } from "../../context.js";

function cloneBoundFlowEntry(input: {
  entry: FlowIndexEntry;
  target_space_id: string;
}): FlowIndexEntry {
  const next: FlowIndexEntry = {
    ...input.entry,
    origin_space_id: input.target_space_id,
    step_spaces: input.entry.step_spaces.map((spaceId) =>
      spaceId === input.entry.origin_space_id ? input.target_space_id : spaceId,
    ),
  };
  if (next.step_spaces.length === 0) {
    next.step_spaces = [input.target_space_id];
  }
  return next;
}

function flowRowsFromEntries(entries: FlowIndexEntry[]): Array<FlowIndexEntry & { payload_json: string }> {
  return entries.map((entry) => ({
    ...entry,
    payload_json: JSON.stringify(entry),
  }));
}

function recomputeFlowChanges(
  currentFlows: Array<{ flow_id: string; digest: string }>,
  nextFlows: Array<{ flow_id: string; digest: string }>,
): Array<{ resource: "flows"; key: string; change: "added" | "updated" | "removed" | "unchanged"; digest?: string }> {
  const currentByKey = new Map(currentFlows.map((row) => [row.flow_id, row]));
  const nextByKey = new Map(nextFlows.map((row) => [row.flow_id, row]));
  const out: Array<{ resource: "flows"; key: string; change: "added" | "updated" | "removed" | "unchanged"; digest?: string }> = [];

  for (const [key, row] of nextByKey) {
    const prev = currentByKey.get(key);
    if (!prev) {
      out.push({ resource: "flows", key, change: "added", digest: row.digest });
      continue;
    }
    if (prev.digest !== row.digest) {
      out.push({ resource: "flows", key, change: "updated", digest: row.digest });
      continue;
    }
    out.push({ resource: "flows", key, change: "unchanged", digest: row.digest });
  }

  for (const [key] of currentByKey) {
    if (!nextByKey.has(key)) {
      out.push({ resource: "flows", key, change: "removed" });
    }
  }

  return out;
}

async function resolveBoundFlows(input: {
  bundle: SpaceApplyBundle;
  studio: DaemonContext["murrmurePersistence"];
  target_space_id: string;
}): Promise<{
  flows: FlowIndexEntry[];
  warnings: Array<{ flow_id: string; code: string; message: string }>;
}> {
  const out: FlowIndexEntry[] = [];
  const warnings: Array<{ flow_id: string; code: string; message: string }> = [];
  if (!input.bundle.bindings) {
    return { flows: out, warnings };
  }

  const resolvedBindings = resolveBindingsFile(input.bundle.bindings.file);
  if (!resolvedBindings.ok) {
    warnings.push({
      flow_id: "bindings",
      code: resolvedBindings.code,
      message: resolvedBindings.message,
    });
    return { flows: out, warnings };
  }

  for (const flowBinding of resolvedBindings.value.flows) {
    if (flowBinding.source.kind === "local") {
      continue;
    }

    const sourceSpace =
      flowBinding.source.kind === "space"
        ? flowBinding.source.space_id.replace(/^spc_/, "")
        : undefined;
    const entry = await input.studio.getFlowIndexEntry(flowBinding.ref, sourceSpace);
    if (!entry) {
      warnings.push({
        flow_id: "bindings",
        code: "BINDINGS_UNRESOLVED",
        message: `Flow binding '${flowBinding.ref}' from '${flowBinding.source.kind === "space" ? `space:${flowBinding.source.space_id}` : "catalog"}' could not be resolved`,
      });
      continue;
    }
    out.push(
      cloneBoundFlowEntry({
        entry,
        target_space_id: input.target_space_id,
      }),
    );
  }

  return { flows: out, warnings };
}

export function mountSpaceIndexRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.post("/v1/spaces/:space_id/link", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:write", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json();
    const host = String(body.host ?? "local");
    const path = String(body.path ?? "");
    if (!path) {
      return c.json({ code: "INVALID_BINDING", message: "path is required" }, 400);
    }

    const bare = bareSpaceId(space_id);
    const space = await murrmurePersistence.getSpace(bare);
    if (!space) return c.json({ code: "space_not_found", message: "Space not found" }, 404);

    const existing = await murrmurePersistence.getSpaceBindings(bare);
    const bindings = SpaceBindingsSchema.parse([
      ...existing.filter((b) => !(isLocalSpaceBinding(b) && b.host === host && b.path === path)),
      { host, path, primary: body.primary !== false },
    ].map((b, i, arr) => ({ ...b, primary: i === arr.length - 1 ? Boolean(b.primary) : false })));

    await murrmurePersistence.setSpaceBindings(bare, bindings);
    const landing = await markSpaceLinkForActor(murrmurePersistence, auth.actor_id);

    const originSpaceId = prefixedSpaceId(bare);
    broadcastSse(ctx, {
      event: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
      data: { space_id: originSpaceId, changed: 0 },
    });
    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
        space_id: originSpaceId,
        changed: 0,
      },
    });

    return c.json({
      space_id: prefixedSpaceId(bare),
      bindings,
      suggest_landing: landing.suggest_landing,
    });
  });

  app.post("/v1/spaces/:space_id/link/remote", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:write", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json();
    const peer_hub_id = String(body.peer_hub_id ?? body.peer ?? "");
    const remote_space_id = String(body.remote_space_id ?? body.space ?? "");
    if (!peer_hub_id || !remote_space_id) {
      return c.json(
        { code: "INVALID_BINDING", message: "peer_hub_id and remote_space_id are required" },
        400,
      );
    }

    const bare = bareSpaceId(space_id);
    const space = await murrmurePersistence.getSpace(bare);
    if (!space) return c.json({ code: "space_not_found", message: "Space not found" }, 404);

    const binding = RemoteHubSpaceBindingSchema.parse({
      type: "remote_hub",
      peer_hub_id,
      remote_space_id: remote_space_id.startsWith("spc_")
        ? remote_space_id
        : prefixedSpaceId(remote_space_id),
      primary: true,
    });

    await murrmurePersistence.setSpaceBindings(bare, [binding]);
    return c.json({ space_id: prefixedSpaceId(bare), bindings: [binding] });
  });

  app.post("/v1/spaces/:space_id/apply", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:write", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json();
    const rawBundle = (body.bundle ?? body) as { flows?: Array<{ manifest?: unknown }> };
    for (const flow of rawBundle.flows ?? []) {
      const guard = rejectInlineScriptSteps(flow.manifest);
      if (!guard.ok) {
        return c.json({ code: guard.code, message: guard.message }, 400);
      }
      const manifestCheck = parseFlowManifest(flow.manifest);
      if (!manifestCheck.ok) {
        return c.json({ code: manifestCheck.code, message: manifestCheck.message }, 400);
      }
    }

    const parsed = SpaceApplyBundleSchema.safeParse(body.bundle ?? body);
    if (!parsed.success) {
      return c.json(
        { code: "INVALID_APPLY_BUNDLE", message: "Apply bundle failed validation", issues: parsed.error.issues },
        400,
      );
    }

    const validation = validateApplyBundle(parsed.data);
    if (!validation.ok) {
      return c.json({ code: validation.code, message: validation.message }, 400);
    }

    for (const flow of parsed.data.flows ?? []) {
      const raw = flow.raw ?? flow.manifest;
      const check = parseFlowManifest(raw);
      if (!check.ok) {
        return c.json({ code: check.code, message: check.message }, 400);
      }
    }

    const bare = bareSpaceId(space_id);
    const space = await murrmurePersistence.getSpace(bare);
    if (!space) return c.json({ code: "space_not_found", message: "Space not found" }, 404);

    const policyCheck = requireInstallPolicy(auth, space, effective);
    if (policyCheck) return policyCheck;

    const originSpaceId = prefixedSpaceId(bare);
    const current = await murrmurePersistence.getSpaceIndexSnapshot(bare);
    const result = applyIndexDiff(current, parsed.data, originSpaceId);

    const bound = await resolveBoundFlows({
      bundle: parsed.data,
      studio: murrmurePersistence,
      target_space_id: originSpaceId,
    });
    const mergedFlowEntries = [
      ...result.next.flows.map((row) => {
        const { payload_json: _payload, ...entry } = row;
        return entry;
      }),
    ];
    const seenFlowIds = new Set(mergedFlowEntries.map((entry) => entry.flow_id));
    for (const entry of bound.flows) {
      if (seenFlowIds.has(entry.flow_id)) continue;
      mergedFlowEntries.push(entry);
      seenFlowIds.add(entry.flow_id);
    }
    const mergedFlowRows = flowRowsFromEntries(mergedFlowEntries);
    const flowChanges = recomputeFlowChanges(current.flows, mergedFlowRows);
    result.next.flows = mergedFlowRows;
    result.changes = [...result.changes.filter((change) => change.resource !== "flows"), ...flowChanges];
    result.summary.flows = mergedFlowRows.length;
    result.summary.changed = result.changes.filter((change) => change.change !== "unchanged").length;

    // Candidate apply order is Views → flows/contracts → handlers → atomic
    // commit. Handler bindings are resolved against the post-apply flow + View
    // index (local + bound + preserved) before the applied index is replaced,
    // so a missing/unbuilt View or a stale alias hard-fails and leaves the
    // previous configuration active.
    const bindingFlows = mergedFlowEntries.map((entry) => ({
      name: entry.name,
      step_ids: entry.step_contract_catalog?.step_ids ?? [],
    }));
    const bindingViews = (parsed.data.views ?? (current.views ?? []).map((row) => {
      const parsed = JSON.parse(row.payload_json) as { view_id?: string; build?: { dist_present: boolean; entry_present: boolean } };
      return { view_id: parsed.view_id ?? row.key, build: parsed.build };
    })).map((view) => ({ view_id: view.view_id, build: view.build }));
    const handlerBindings = validateHandlerBindings({
      handlers: parsed.data.handlers?.file.handlers ?? [],
      flows: bindingFlows,
      views: bindingViews,
    });
    if (!handlerBindings.ok) {
      return c.json(
        { code: handlerBindings.code, message: handlerBindings.message, handler_id: handlerBindings.handler_id },
        400,
      );
    }

    const warnings = [...lintSpaceApplyBundle(parsed.data), ...bound.warnings];

    await murrmurePersistence.replaceSpaceIndex(bare, result.next);

    broadcastSse(ctx, {
      event: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
      data: {
        space_id: originSpaceId,
        summary: result.summary,
        changed: result.summary.changed,
      },
    });
    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
        space_id: originSpaceId,
        summary: result.summary,
        changed: result.summary.changed,
      },
    });

    return c.json({
      space_id: originSpaceId,
      summary: result.summary,
      changes: result.changes.filter((change) => change.change !== "unchanged"),
      status: buildIndexStatus(result.next),
      warnings,
    });
  });

  app.get("/v1/spaces/:space_id/index/status", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const bare = bareSpaceId(space_id);
    const snapshot = await murrmurePersistence.getSpaceIndexSnapshot(bare);
    const bindings = await murrmurePersistence.getSpaceBindings(bare);
    return c.json({
      space_id: prefixedSpaceId(bare),
      bindings,
      ...buildIndexStatus(snapshot),
    });
  });

  app.get("/v1/spaces/:space_id/actions", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const actions = await murrmurePersistence.listIndexedActions(bareSpaceId(space_id));
    return c.json({ actions });
  });

  app.get("/v1/spaces/:space_id/executors", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const executors = await murrmurePersistence.listIndexedExecutors(bareSpaceId(space_id));
    return c.json({ executors });
  });

  app.get("/v1/spaces/:space_id/hooks", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const hooks = await murrmurePersistence.listIndexedHooks(bareSpaceId(space_id));
    return c.json({ hooks });
  });

  app.post("/v1/spaces/:space_id/actions/:action_name/invoke", async (c) => {
    const space_id = c.req.param("space_id");
    const action_name = c.req.param("action_name");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "action:invoke", effective);
    if (capCheck) return capCheck;

    const body = await c.req.json().catch(() => ({}));
    const result = await ctx.invokeService.invokeAction({
      space_id,
      action_name,
      body,
      idempotency_header: c.req.header("Idempotency-Key") ?? undefined,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
    });
    return c.json(result.body, result.http);
  });

  app.get("/v1/spaces/:space_id/index/flows", async (c) => {
    const space_id = c.req.param("space_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const flows = await murrmurePersistence.listFlowIndex(bareSpaceId(space_id));
    return c.json({ flows });
  });

  app.get("/v1/flows/:flow_id", async (c) => {
    const flow_id = c.req.param("flow_id");
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const scopeCheck = requireScope(auth, "space:read");
    if (scopeCheck) return scopeCheck;

    const scopedSpaceId = auth.space_id !== "bootstrap" ? bareSpaceId(auth.space_id) : undefined;
    const flow = await murrmurePersistence.getFlowIndexEntry(flow_id, scopedSpaceId);
    if (!flow) return c.json({ code: "flow_not_found", message: "Flow not indexed" }, 404);

    if (auth.space_id !== "bootstrap") {
      const authSpaceId = prefixedSpaceId(bareSpaceId(auth.space_id));
      if (flow.origin_space_id !== authSpaceId) {
        return c.json(
          { code: "SCOPE_ENFORCEMENT_FAILURE", message: "Token not valid for this space or action" },
          403,
        );
      }
    }

    return c.json(flow);
  });
}
