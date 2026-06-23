import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CapabilityServerContext, HubBridgeClient } from "../server.js";

interface Route {
  method: string;
  path: string;
  handler: (context: SimHonoContext) => unknown;
}

interface SimHonoContext extends CapabilityServerContext {
  json: (data: unknown, status?: number) => unknown;
  text: (data: unknown, status?: number) => unknown;
  req: {
    param: (name: string) => string | undefined;
    query: (name: string) => string | null;
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    raw: unknown;
  };
}

export interface CapabilityMountResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function createSimHubBridge(): HubBridgeClient {
  return {
    execute: async () => ({ outcome: "ok", body: {} }),
    query: async () => ({}),
    getInstallConfig: () => ({}),
    getPrincipal: async () => ({
      actorId: "sim:local",
      spaceId: "spc_sim_local",
      tokenId: "sim-token",
    }),
  };
}

function createSimServerContext(opts: {
  routesPrefix: string;
  packageId: string;
  version: string;
}): CapabilityServerContext {
  const hub = createSimHubBridge();
  return {
    spaceId: "spc_sim_local",
    installId: "ins_sim_local",
    packageId: opts.packageId,
    version: opts.version,
    routesPrefix: opts.routesPrefix,
    contractRefId: "cref_sim_local",
    hub,
    getInstallConfig: () => hub.getInstallConfig(),
  };
}

function matchRoute(
  routes: Route[],
  method: string,
  pathname: string,
): { handler: Route["handler"]; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const parts = route.path.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    if (parts.length !== pathParts.length) {
      continue;
    }
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      const value = pathParts[index]!;
      if (part.startsWith(":")) {
        params[part.slice(1)] = decodeURIComponent(value);
      } else if (part !== value) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { handler: route.handler, params };
    }
  }
  return null;
}

function invokeRouteHandler(
  handler: Route["handler"],
  params: Record<string, string>,
  body: unknown,
  requestHeaders: Record<string, string>,
  requestUrl: URL,
  serverContext: CapabilityServerContext,
): Promise<CapabilityMountResponse> {
  let status = 200;
  let responseHeaders: Record<string, string> = {};
  let responseBody = "";
  let responseEnded = false;

  const context: SimHonoContext = {
    ...serverContext,
    json: (data, nextStatus = 200) => {
      status = nextStatus;
      responseHeaders = { "content-type": "application/json; charset=utf-8" };
      responseBody = JSON.stringify(data);
      responseEnded = true;
      return data;
    },
    text: (data, nextStatus = 200) => {
      status = nextStatus;
      responseHeaders = { "content-type": "text/plain; charset=utf-8" };
      responseBody = String(data);
      responseEnded = true;
      return data;
    },
    req: {
      param: (name) => params[name],
      query: (name) => requestUrl.searchParams.get(name),
      header: (name) => requestHeaders[name.toLowerCase()],
      json: async () => body,
      raw: null,
    },
  };

  return Promise.resolve(handler(context)).then((result) => {
    if (responseEnded) {
      return { status, headers: responseHeaders, body: responseBody };
    }
    if (result !== undefined) {
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(result),
      };
    }
    return { status: 204, headers: {}, body: "" };
  });
}

interface LoadedMount {
  routes: Route[];
}

async function loadMountModule(stageDir: string, serverContext: CapabilityServerContext): Promise<LoadedMount> {
  const mountPath = join(stageDir, "server", "mount.mjs");
  if (!existsSync(mountPath)) {
    return { routes: [] };
  }

  const routes: Route[] = [];
  const app = {
    get(path: string, handler: Route["handler"]) {
      routes.push({ method: "GET", path, handler });
    },
    post(path: string, handler: Route["handler"]) {
      routes.push({ method: "POST", path, handler });
    },
    patch(path: string, handler: Route["handler"]) {
      routes.push({ method: "PATCH", path, handler });
    },
    route() {
      /* stub */
    },
  };

  const moduleUrl = `${pathToFileURL(mountPath).href}?t=${Date.now()}`;
  const mod = (await import(moduleUrl)) as { mountRoutes?: (app: typeof app, ctx: CapabilityServerContext) => void };
  if (typeof mod.mountRoutes === "function") {
    mod.mountRoutes(app, serverContext);
  } else {
    app.get("/health", (c) => c.json({ ok: true, package: serverContext.packageId }));
  }

  return { routes };
}

export class DevSimCapabilityMount {
  private routes: Route[] = [];
  private serverContext: CapabilityServerContext;

  constructor(opts: { routesPrefix: string; packageId: string; version: string }) {
    this.serverContext = createSimServerContext(opts);
  }

  async reload(stageDir: string): Promise<void> {
    const loaded = await loadMountModule(stageDir, this.serverContext);
    this.routes = loaded.routes;
  }

  hasRoutes(): boolean {
    return this.routes.length > 0;
  }

  async handleRequest(
    fullPath: string,
    method: string,
    body: unknown,
    requestHeaders: Record<string, string>,
    routesPrefix: string,
  ): Promise<CapabilityMountResponse | null> {
    if (!fullPath.startsWith(routesPrefix)) {
      return null;
    }

    let pathname = fullPath.slice(routesPrefix.length) || "/";
    if (!pathname.startsWith("/")) {
      pathname = `/${pathname}`;
    }

    const matched = matchRoute(this.routes, method, pathname);
    if (!matched) {
      return {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: false, error: "not found" }),
      };
    }

    const requestUrl = new URL(fullPath, "http://127.0.0.1");

    try {
      return await invokeRouteHandler(
        matched.handler,
        matched.params,
        body,
        requestHeaders,
        requestUrl,
        this.serverContext,
      );
    } catch (error) {
      return {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: false, error: String(error) }),
      };
    }
  }
}
