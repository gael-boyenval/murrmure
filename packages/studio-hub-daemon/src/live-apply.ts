import type { Hono } from "hono";
import { STUDIO_DENIAL_CODES } from "@murrmure/contracts";
import { addSpaceId } from "@murrmure/hub-core";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import type { DaemonContext } from "./context.js";
import { actorKind, denialResponse, hasScope } from "./routes/config/scopes.js";
import type { CapabilityMount } from "./mount-registry.js";
import { broadcastSse } from "./context.js";
import { blobDir } from "./bundle-store.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type LiveApplyResult =
  | {
      ok: true;
      evolution_state: "live";
      install_id: string;
      mount: CapabilityMount;
      tools_added: string[];
      tools_removed: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      hint?: Record<string, unknown>;
      http_status: number;
    };

export function detectMountCollision(
  otherMounts: Pick<CapabilityMount, "package_id" | "routes_prefix" | "mcp_tools">[],
  candidate: { routes_prefix: string; mcp_tools: string[] },
): Extract<LiveApplyResult, { ok: false }> | null {
  const prefixOwner = otherMounts.find((m) => m.routes_prefix === candidate.routes_prefix);
  if (prefixOwner) {
    return {
      ok: false,
      code: STUDIO_DENIAL_CODES.ROUTE_PREFIX_COLLISION,
      message: `Route prefix ${candidate.routes_prefix} already mounted by ${prefixOwner.package_id}`,
      hint: { routes_prefix: candidate.routes_prefix, owner_package_id: prefixOwner.package_id },
      http_status: 409,
    };
  }

  const ownedTools = new Map(otherMounts.flatMap((m) => m.mcp_tools.map((t) => [t, m.package_id] as const)));
  for (const tool of candidate.mcp_tools) {
    const owner = ownedTools.get(tool);
    if (owner) {
      return {
        ok: false,
        code: STUDIO_DENIAL_CODES.MCP_TOOL_COLLISION,
        message: `MCP tool ${tool} already provided by ${owner}`,
        hint: { tool, owner_package_id: owner },
        http_status: 409,
      };
    }
  }

  return null;
}

function readBundleMeta(blobPath: string, version: string, packageId: string) {
  const mcpRaw = JSON.parse(readFileSync(join(blobPath, "contract", "mcp-tools.json"), "utf-8")) as {
    tools: Record<string, unknown>;
  };
  const manifestRaw = JSON.parse(readFileSync(join(blobPath, "manifest.json"), "utf-8")) as {
    mcp_tools_by_version?: Record<string, string[]>;
    query_types_by_version?: Record<string, string[]>;
    routes_prefix?: string;
  };
  const nextTools = manifestRaw.mcp_tools_by_version?.[version] ?? Object.keys(mcpRaw.tools ?? {});
  const queryTypes = manifestRaw.query_types_by_version?.[version] ?? [];
  const routes_prefix = manifestRaw.routes_prefix ?? `/api/${packageId}`;
  return { nextTools, queryTypes, routes_prefix };
}

export async function executeLiveApply(
  app: Hono,
  ctx: DaemonContext,
  spaceId: string,
  installId: string,
  auth: import("./auth.js").TokenContext,
): Promise<LiveApplyResult> {
  const bareSpace = bareSpaceId(spaceId);
  const space = await ctx.studioPersistence.getSpace(bareSpace);
  if (!space) {
    return { ok: false, code: "space_not_found", message: "Space not found", http_status: 404 };
  }

  const kind = actorKind(auth);
  if (space.install_policy === "human_only" && kind !== "human") {
    return {
      ok: false,
      code: STUDIO_DENIAL_CODES.INSTALL_POLICY_VIOLATION,
      message: "Install blocked: space policy is human_only",
      hint: { install_policy: "human_only" },
      http_status: 403,
    };
  }

  if (kind === "agent" && !hasScope(auth, "flow:install")) {
    return {
      ok: false,
      code: STUDIO_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE,
      message: "Flow install permission required",
      hint: { required_scope: "flow:install" },
      http_status: 403,
    };
  }

  const install = await ctx.studioPersistence.getCapabilityInstall(installId);
  if (!install || bareSpaceId(install.space_id) !== bareSpace) {
    return { ok: false, code: "not_found", message: "Install not found", http_status: 404 };
  }

  if (!install.bundle_digest) {
    return {
      ok: false,
      code: STUDIO_DENIAL_CODES.LIVE_APPLY_FAILED,
      message: `Live apply requires a CDK bundle for ${install.package_id}`,
      http_status: 400,
    };
  }

  const prior = ctx.mountRegistry.getMount(spaceId, install.package_id);
  const priorTools = prior?.mcp_tools ?? [];

  const blobPath = blobDir(ctx.config.dataDir, install.bundle_digest);
  let nextTools: string[];
  let queryTypes: string[];
  let routes_prefix: string;
  try {
    const meta = readBundleMeta(blobPath, install.version, install.package_id);
    nextTools = meta.nextTools;
    queryTypes = meta.queryTypes;
    routes_prefix = install.routes_prefix ?? meta.routes_prefix;
  } catch {
    return {
      ok: false,
      code: STUDIO_DENIAL_CODES.LIVE_APPLY_FAILED,
      message: "Failed to read bundle MCP tools",
      http_status: 500,
    };
  }

  const otherMounts = ctx.mountRegistry
    .listAll()
    .filter((m) => bareSpaceId(m.space_id) === bareSpace && m.package_id !== install.package_id);
  const collision = detectMountCollision(otherMounts, { routes_prefix, mcp_tools: nextTools });
  if (collision) return collision;

  const mount: CapabilityMount = {
    install_id: install.install_id,
    space_id: addSpaceId(bareSpace),
    package_id: install.package_id,
    semver: install.version,
    contract_ref_id: install.contract_ref_id,
    routes_prefix,
    mcp_tools: nextTools,
    query_types: queryTypes,
    applied_at: new Date().toISOString(),
    bundle_digest: install.bundle_digest,
  };

  try {
    await ctx.workerPool.spawn({
      packageId: install.package_id,
      digest: install.bundle_digest,
      blobPath,
      routesPrefix: routes_prefix,
      spaceId: prefixedSpaceId(bareSpace),
      installId: install.install_id,
      contractRefId: install.contract_ref_id,
      version: install.version,
      bridgePort: ctx.config.port,
      installConfig: (install.config as Record<string, unknown>) ?? {},
    });
    await ctx.mountRegistry.apply(app, ctx, mount);
    await ctx.mcpToolRegistry.rebuild(spaceId);
    await ctx.studioPersistence.updateCapabilityInstall(install.install_id, { evolution_state: "live" });
  } catch (e) {
    ctx.workerPool.kill(install.package_id, install.bundle_digest);
    if (prior) {
      await ctx.mountRegistry.apply(app, ctx, prior).catch(() => undefined);
    } else {
      await ctx.mountRegistry.unmount(spaceId, install.package_id).catch(() => undefined);
    }
    const message = e instanceof Error ? e.message : "Mount failed";
    return {
      ok: false,
      code: STUDIO_DENIAL_CODES.LIVE_APPLY_FAILED,
      message,
      http_status: 500,
    };
  }

  const added = nextTools.filter((t) => !priorTools.includes(t));
  const removed = priorTools.filter((t) => !nextTools.includes(t));
  const unchanged = nextTools.filter((t) => priorTools.includes(t));

  await ctx.handler.execute({
    kind: "event.append",
    provenance: {
      space_id: prefixedSpaceId(bareSpace),
      actor_id: auth.actor_id,
      token_id: auth.token_id,
    },
    event_type: "capability.live_applied",
    payload: {
      install_id: install.install_id,
      package_id: install.package_id,
      version: install.version,
    },
  } as never);

  broadcastSse(ctx, {
    event: "capability.live_applied",
    data: {
      install_id: install.install_id,
      package_id: install.package_id,
      version: install.version,
      bundle_digest: install.bundle_digest,
    },
  });

  broadcastSse(ctx, {
    event: "journal.append",
    data: {
      type: "capability.live_applied",
      install_id: install.install_id,
      package_id: install.package_id,
    },
  });

  broadcastSse(ctx, {
    event: "capability.dev_reload",
    data: {
      install_id: install.install_id,
      package_id: install.package_id,
      version: install.version,
      bundle_digest: install.bundle_digest,
    },
  });

  const principals = ctx.controlBus.listPrincipalsForSpace(bareSpace);
  for (const p of principals) {
    ctx.controlBus.publishToolsChanged(p, addSpaceId(bareSpace), added, removed, unchanged);
    if (prior && prior.semver !== install.version) {
      ctx.controlBus.publish(p, {
        method: "studio/control.contract_updated",
        params: {
          space_id: prefixedSpaceId(bareSpace),
          package_id: install.package_id,
          from_version: prior.semver,
          to_version: install.version,
          contract_ref_id: install.contract_ref_id,
        },
      });
    }
  }

  return {
    ok: true,
    evolution_state: "live",
    install_id: install.install_id,
    mount,
    tools_added: added,
    tools_removed: removed,
  };
}

export async function executeUnmount(
  app: Hono,
  ctx: DaemonContext,
  spaceId: string,
  packageId: string,
): Promise<void> {
  const prior = ctx.mountRegistry.getMount(spaceId, packageId);
  if (!prior) return;
  const priorTools = prior.mcp_tools;

  if (prior.bundle_digest) {
    ctx.workerPool.kill(packageId, prior.bundle_digest);
  }

  await ctx.mountRegistry.unmount(spaceId, packageId);
  await ctx.mcpToolRegistry.rebuild(spaceId);

  const bare = bareSpaceId(spaceId);
  const principals = ctx.controlBus.listPrincipalsForSpace(bare);
  for (const p of principals) {
    ctx.controlBus.publishToolsChanged(p, addSpaceId(bare), [], priorTools, []);
  }

  await ctx.handler.execute({
    kind: "event.append",
    provenance: { space_id: addSpaceId(bare), actor_id: "system", token_id: "system" },
    event_type: "capability.unmounted",
    payload: { package_id: packageId, space_id: addSpaceId(bare) },
  } as never);

  void app;
}
