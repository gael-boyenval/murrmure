import { existsSync, readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, join, normalize } from "node:path";
import { DevSimFlowMount, type CapabilityMountResponse } from "./flow-mount.js";
import {
  DEV_SIM_FIXTURES,
  parseExpectedRevision,
  parseFixture,
  parseInstanceActor,
  SimulatedMurrmureMachine,
  type DevSimFixture,
} from "./state-machine.js";

interface DevSimManifest {
  id: string;
  version: string;
  routes_prefix: string;
  ui: { canvas_route: string };
}

export interface DevSimServerOptions {
  port: number;
  sourceDir: string;
  stageDir: string;
  manifest: DevSimManifest;
  contract: unknown;
  fixture?: DevSimFixture;
  bundleDigest: string;
}

export interface DevSimServerReloadOptions {
  sourceDir: string;
  stageDir: string;
  manifest: DevSimManifest;
  contract: unknown;
  fixture?: DevSimFixture;
  bundleDigest: string;
}

export interface DevSimServerHandle {
  url: string;
  port: number;
  reload: (opts: DevSimServerReloadOptions) => void;
  stop: () => Promise<void>;
}

interface ServerState {
  sourceDir: string;
  stageDir: string;
  manifest: DevSimManifest;
  machine: SimulatedMurrmureMachine;
  bundleDigest: string;
  activeFixture: DevSimFixture;
}

interface SimApiResult {
  status: number;
  body: unknown;
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function normalizeMethod(method: string | undefined): string {
  return (method ?? "GET").toUpperCase();
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf-8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => resolve(raw));
    request.on("error", reject);
  });
}

function parseJsonBody(rawBody: string): Record<string, unknown> {
  if (!rawBody.trim()) {
    return {};
  }
  try {
    const value = JSON.parse(rawBody);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function renderShellHtml(state: ServerState, port: number): string {
  const initContext = JSON.stringify({
    spaceId: "spc_sim_local",
    instanceId: "inst-sim-local",
    hubUrl: `http://127.0.0.1:${port}`,
    canvasRoute: state.manifest.ui.canvas_route,
    flowId: state.manifest.id,
    version: state.manifest.version,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Capability Sim Runtime</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
        background: #f3f4f6;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background: #111827;
        color: #f9fafb;
        font-size: 0.875rem;
      }
      #layout {
        padding: 0.75rem;
      }
      iframe {
        width: 100%;
        min-height: calc(100vh - 4rem);
        border: 1px solid #d1d5db;
        border-radius: 0.75rem;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <header>
      <strong>mrmr flow dev --sim</strong>
      <span id="status">bundle ${state.bundleDigest}</span>
    </header>
    <main id="layout">
      <iframe id="capability-canvas" src="/capability/ui/shell.html?digest=${encodeURIComponent(
        state.bundleDigest,
      )}" sandbox="allow-scripts"></iframe>
    </main>
    <script type="module">
      const iframe = document.getElementById("capability-canvas");
      const status = document.getElementById("status");
      const initContext = ${initContext};
      let currentDigest = ${JSON.stringify(state.bundleDigest)};

      const postInit = () => {
        iframe.contentWindow?.postMessage({ type: "init", ctx: initContext }, "*");
      };

      iframe.addEventListener("load", postInit);

      window.addEventListener("message", async (event) => {
        if (event.source !== iframe.contentWindow) {
          return;
        }
        const data = event.data;
        if (!data || data.type !== "hub-fetch" || typeof data.id !== "string") {
          return;
        }

        try {
          const response = await fetch("/__sim/hub-fetch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              path: data.path,
              init: data.init,
            }),
          });
          const payload = await response.json();
          iframe.contentWindow?.postMessage(
            {
              type: "hub-fetch-result",
              id: data.id,
              ...payload,
            },
            "*",
          );
        } catch (error) {
          iframe.contentWindow?.postMessage(
            {
              type: "hub-fetch-result",
              id: data.id,
              ok: false,
              status: 502,
              headers: { "content-type": "application/json; charset=utf-8" },
              body: JSON.stringify({
                ok: false,
                error: {
                  code: "SIM_BRIDGE_FETCH_FAILED",
                  message: String(error),
                },
              }),
            },
            "*",
          );
        }
      });

      const events = new EventSource("/__sim/events");
      events.addEventListener("capability.dev_reload", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.bundle_digest === currentDigest) {
            return;
          }
          currentDigest = payload.bundle_digest;
          status.textContent = "bundle " + currentDigest;
          iframe.contentWindow?.postMessage({ type: "reload" }, "*");
        } catch {
          iframe.contentWindow?.postMessage({ type: "reload" }, "*");
        }
      });
    </script>
  </body>
</html>
`;
}

function resolveUiFilePath(rootDir: string, requestedPath: string): string | null {
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = join(rootDir, "ui", normalizedPath);
  const allowedRoot = join(rootDir, "ui");
  if (!absolute.startsWith(allowedRoot)) {
    return null;
  }
  return absolute;
}

function writeCapabilityMountResponse(response: ServerResponse, result: CapabilityMountResponse): void {
  response.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) {
    response.setHeader(key, value);
  }
  response.end(result.body);
}

function serveStaticUiFile(
  response: ServerResponse,
  state: ServerState,
  requestedPath: string,
): boolean {
  const stagePath = resolveUiFilePath(state.stageDir, requestedPath);
  if (stagePath && existsSync(stagePath)) {
    const extension = extname(stagePath);
    response.statusCode = 200;
    response.setHeader("content-type", CONTENT_TYPES[extension] ?? "application/octet-stream");
    response.end(readFileSync(stagePath));
    return true;
  }

  const sourcePath = resolveUiFilePath(state.sourceDir, requestedPath);
  if (sourcePath && existsSync(sourcePath)) {
    const extension = extname(sourcePath);
    response.statusCode = 200;
    response.setHeader("content-type", CONTENT_TYPES[extension] ?? "application/octet-stream");
    response.setHeader("x-capability-sim-source-fallback", "1");
    response.end(readFileSync(sourcePath));
    return true;
  }

  return false;
}

function handleSimApi(state: ServerState, urlPath: string, method: string, body: Record<string, unknown>): SimApiResult {
  if (urlPath === "/sim/install" && method === "GET") {
    const snapshot = state.machine.snapshot();
    return {
      status: 200,
      body: { ok: true, fixture: snapshot.fixture, install: snapshot.install },
    };
  }

  if (urlPath === "/sim/install/transition" && method === "POST") {
    const action = typeof body.action === "string" ? body.action : "";
    const result = state.machine.transitionInstall(action);
    if (!result.ok) {
      return { status: 409, body: { ok: false, error: result.error } };
    }
    return { status: 200, body: { ok: true, install: result.value } };
  }

  if (urlPath === "/sim/instances" && method === "GET") {
    return {
      status: 200,
      body: { ok: true, instances: state.machine.snapshot().instances },
    };
  }

  if (urlPath === "/sim/fixtures" && method === "GET") {
    return {
      status: 200,
      body: {
        ok: true,
        active_fixture: state.machine.snapshot().fixture,
        fixtures: DEV_SIM_FIXTURES,
      },
    };
  }

  if (urlPath.startsWith("/sim/fixtures/") && urlPath.endsWith("/apply") && method === "POST") {
    const fixture = decodeURIComponent(urlPath.slice("/sim/fixtures/".length, -"/apply".length));
    const result = state.machine.applyFixture(fixture);
    if (!result.ok) {
      return { status: 400, body: { ok: false, error: result.error } };
    }
    const parsedFixture = parseFixture(fixture);
    if (parsedFixture) {
      state.activeFixture = parsedFixture;
    }
    return { status: 200, body: { ok: true, snapshot: result.value } };
  }

  if (urlPath === "/sim/reset" && method === "POST") {
    const result = state.machine.applyFixture(state.activeFixture);
    if (!result.ok) {
      return { status: 500, body: { ok: false, error: result.error } };
    }
    return { status: 200, body: { ok: true, snapshot: result.value } };
  }

  const instanceMatch = /^\/sim\/instances\/([^/]+)(\/transition)?$/.exec(urlPath);
  if (instanceMatch) {
    const instanceId = decodeURIComponent(instanceMatch[1] ?? "");
    const isTransitionRoute = Boolean(instanceMatch[2]);
    if (!isTransitionRoute && method === "GET") {
      const instance = state.machine.snapshot().instances.find((item) => item.id === instanceId);
      if (!instance) {
        return {
          status: 404,
          body: {
            ok: false,
            error: {
              code: "INSTANCE_NOT_FOUND",
              message: `Instance '${instanceId}' does not exist in simulator`,
            },
          },
        };
      }
      return { status: 200, body: { ok: true, instance } };
    }

    if (isTransitionRoute && method === "POST") {
      const event = typeof body.event === "string" ? body.event : "";
      const result = state.machine.transitionInstance(instanceId, event, {
        actor: parseInstanceActor(body.actor),
        expectedRevision: parseExpectedRevision(body.expected_revision),
      });
      if (!result.ok) {
        return { status: 409, body: { ok: false, error: result.error } };
      }
      return { status: 200, body: { ok: true, instance: result.value } };
    }
  }

  return {
    status: 404,
    body: {
      ok: false,
      error: {
        code: "SIM_ROUTE_NOT_FOUND",
        message: `No simulated route for ${method} ${urlPath}`,
      },
    },
  };
}

interface NormalizedFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function normalizeFetchInit(raw: unknown): NormalizedFetchInit {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const parsed = raw as { method?: unknown; headers?: unknown; body?: unknown };
  const normalizedHeaders: Record<string, string> = {};
  if (parsed.headers && typeof parsed.headers === "object") {
    for (const [key, value] of Object.entries(parsed.headers as Record<string, unknown>)) {
      if (typeof value === "string") {
        normalizedHeaders[key] = value;
      }
    }
  }
  return {
    method: typeof parsed.method === "string" ? parsed.method : undefined,
    headers: Object.keys(normalizedHeaders).length > 0 ? normalizedHeaders : undefined,
    body: typeof parsed.body === "string" ? parsed.body : undefined,
  };
}

export async function startDevSimServer(opts: DevSimServerOptions): Promise<DevSimServerHandle> {
  let serverPort = opts.port;
  let state: ServerState = {
    sourceDir: opts.sourceDir,
    stageDir: opts.stageDir,
    manifest: opts.manifest,
    machine: new SimulatedMurrmureMachine(opts.contract, opts.fixture ?? "live-install-ready"),
    bundleDigest: opts.bundleDigest,
    activeFixture: opts.fixture ?? "live-install-ready",
  };

  const capabilityMount = new DevSimFlowMount({
    routesPrefix: opts.manifest.routes_prefix,
    flowId: opts.manifest.id,
    version: opts.manifest.version,
  });
  await capabilityMount.reload(opts.stageDir);

  const eventClients = new Set<ServerResponse>();

  const publishReload = (bundleDigest: string) => {
    const payload = JSON.stringify({
      flow_id: state.manifest.id,
      version: state.manifest.version,
      bundle_digest: bundleDigest,
    });
    for (const client of eventClients) {
      client.write(`event: capability.dev_reload\n`);
      client.write(`data: ${payload}\n\n`);
    }
  };

  const requestHandler = async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = normalizeMethod(request.method);
    const path = requestUrl.pathname;
    const requestHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") {
        requestHeaders[key.toLowerCase()] = value;
      }
    }

    if (method === "GET" && path === "/") {
      response.statusCode = 200;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(renderShellHtml(state, serverPort));
      return;
    }

    if (method === "GET" && path === "/__sim/events") {
      response.statusCode = 200;
      response.setHeader("content-type", "text/event-stream");
      response.setHeader("cache-control", "no-cache");
      response.setHeader("connection", "keep-alive");
      response.write("\n");
      eventClients.add(response);
      request.on("close", () => {
        eventClients.delete(response);
      });
      return;
    }

    if (method === "POST" && path === "/__sim/hub-fetch") {
      const parsedBody = parseJsonBody(await readBody(request));
      const simPath = typeof parsedBody.path === "string" ? parsedBody.path : "/";
      const init = normalizeFetchInit(parsedBody.init);
      const nestedMethod = normalizeMethod(init.method);
      const nestedBody = parseJsonBody(typeof init.body === "string" ? init.body : "");
      const nestedPath = new URL(simPath, "http://127.0.0.1").pathname;

      if (nestedPath.startsWith(state.manifest.routes_prefix)) {
        const mounted = await capabilityMount.handleRequest(
          nestedPath,
          nestedMethod,
          nestedBody,
          requestHeaders,
          state.manifest.routes_prefix,
        );
        if (mounted) {
          writeJson(response, 200, {
            ok: mounted.status >= 200 && mounted.status < 300,
            status: mounted.status,
            headers: mounted.headers,
            body: mounted.body,
          });
          return;
        }
      }

      const result = handleSimApi(state, nestedPath, nestedMethod, nestedBody);
      const rawBody = JSON.stringify(result.body);
      writeJson(response, 200, {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: rawBody,
      });
      return;
    }

    if (path.startsWith(state.manifest.routes_prefix)) {
      const parsedBody = method === "GET" || method === "HEAD" ? {} : parseJsonBody(await readBody(request));
      const mounted = await capabilityMount.handleRequest(
        path,
        method,
        parsedBody,
        requestHeaders,
        state.manifest.routes_prefix,
      );
      if (mounted) {
        writeCapabilityMountResponse(response, mounted);
        return;
      }
    }

    if (path.startsWith("/capability/ui/") && method === "GET") {
      const relativePath = path.replace("/capability/ui/", "");
      const served = serveStaticUiFile(response, state, relativePath);
      if (!served) {
        writeJson(response, 404, {
          ok: false,
          error: { code: "SIM_ASSET_NOT_FOUND", message: `Asset not found: ${path}` },
        });
      }
      return;
    }

    if (path.startsWith("/sim/")) {
      const parsedBody = method === "GET" ? {} : parseJsonBody(await readBody(request));
      const result = handleSimApi(state, path, method, parsedBody);
      writeJson(response, result.status, result.body);
      return;
    }

    writeJson(response, 404, {
      ok: false,
      error: { code: "SIM_ROUTE_NOT_FOUND", message: `No route for ${method} ${path}` },
    });
  };

  const server: Server = createServer((request, response) => {
    void requestHandler(request, response).catch((error: unknown) => {
      writeJson(response, 500, {
        ok: false,
        error: {
          code: "SIM_RUNTIME_ERROR",
          message: String(error),
        },
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve simulated runtime address");
  }
  serverPort = address.port;

  return {
    url: `http://127.0.0.1:${serverPort}`,
    port: serverPort,
    reload: (next) => {
      const fixture = next.fixture ?? state.activeFixture;
      state = {
        sourceDir: next.sourceDir,
        stageDir: next.stageDir,
        manifest: next.manifest,
        machine: new SimulatedMurrmureMachine(next.contract, fixture),
        activeFixture: fixture,
        bundleDigest: next.bundleDigest,
      };
      void capabilityMount.reload(next.stageDir);
      publishReload(next.bundleDigest);
    },
    stop: async () => {
      for (const client of eventClients) {
        client.end();
      }
      eventClients.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

