import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TokenContext } from "./auth.js";
import type { CapabilityMount } from "./mount-registry.js";
import type { DaemonContext } from "./context.js";
import { blobDir } from "./bundle-store.js";
import { bareSpaceId } from "./space-id.js";

interface McpToolHttp {
  method: string;
  path: string;
}

interface McpToolsFile {
  tools: Record<string, { http?: McpToolHttp }>;
}

function loadMcpTools(ctx: DaemonContext, mount: CapabilityMount): McpToolsFile | null {
  if (!mount.bundle_digest) return null;
  try {
    const blobPath = blobDir(ctx.config.dataDir, mount.bundle_digest);
    return JSON.parse(readFileSync(join(blobPath, "contract", "mcp-tools.json"), "utf-8")) as McpToolsFile;
  } catch {
    return null;
  }
}

function substitutePath(template: string, args: Record<string, unknown>): { path: string; body: Record<string, unknown> } {
  let path = template;
  const body = { ...args };
  for (const [key, value] of Object.entries(args)) {
    const token = `:${key}`;
    if (path.includes(token)) {
      path = path.replace(token, encodeURIComponent(String(value ?? "")));
      delete body[key];
    }
  }
  return { path, body };
}

export function findMountForTool(
  ctx: DaemonContext,
  spaceId: string,
  toolName: string,
): { mount: CapabilityMount; http: McpToolHttp } | null {
  const bare = bareSpaceId(spaceId);
  for (const mount of ctx.mountRegistry.listAll()) {
    if (bareSpaceId(mount.space_id) !== bare) continue;
    if (!mount.mcp_tools.includes(toolName)) continue;
    if (!mount.bundle_digest) continue;
    const mcp = loadMcpTools(ctx, mount);
    const http = mcp?.tools?.[toolName]?.http;
    if (!http) continue;
    return { mount, http };
  }
  return null;
}

export async function invokeWorkerTool(
  ctx: DaemonContext,
  mount: CapabilityMount,
  http: McpToolHttp,
  args: Record<string, unknown>,
  tokenCtx: TokenContext,
): Promise<unknown> {
  if (!mount.bundle_digest) throw new Error("Mount has no worker bundle");
  const worker = ctx.workerPool.get(mount.package_id, mount.bundle_digest);
  if (!worker) throw new Error("Worker not running");

  const { path, body } = substitutePath(http.path, args);
  const url = new URL(`http://127.0.0.1:${worker.port}${mount.routes_prefix}${path}`);

  if (http.method === "GET") {
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tokenCtx.token_id}`,
    "X-Murrmure-Caller-Token": tokenCtx.token_id,
  };

  const res = await fetch(url.toString(), {
    method: http.method,
    headers,
    body: http.method === "GET" || http.method === "HEAD" ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data === "object" && data && "message" in data ? String(data.message) : `Worker ${res.status}`);
  }
  return data;
}

export async function invokeWorkerQuery(
  ctx: DaemonContext,
  mount: CapabilityMount,
  queryPath: string,
  params: Record<string, unknown>,
  targetSpaceId: string,
): Promise<Record<string, unknown>> {
  if (!mount.bundle_digest) throw new Error("Mount has no worker bundle");
  const worker = ctx.workerPool.get(mount.package_id, mount.bundle_digest);
  if (!worker) throw new Error("Worker not running");

  const url = new URL(`http://127.0.0.1:${worker.port}${mount.routes_prefix}${queryPath}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const workerToken = ctx.workerPool.getToken(mount.package_id, mount.bundle_digest);
  const headers: Record<string, string> = {
    "X-Murrmure-Internal-Space": targetSpaceId.startsWith("spc_") ? targetSpaceId : `spc_${targetSpaceId}`,
  };
  if (workerToken) headers["X-Murrmure-Worker-Token"] = workerToken;

  const res = await fetch(url.toString(), { headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.code ?? "QUERY_FAILED"));
  return data;
}
