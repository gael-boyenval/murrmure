import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHubBridge } from "./hub-bridge-client.js";

// Plain JavaScript on purpose: this entry is spawned with the bare node binary
// (no tsx loader), so it must not contain TypeScript syntax.

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const port = Number(flag("--port") ?? "0");
const bundlePath = flag("--bundle") ?? "";
const prefix = flag("--prefix") ?? "/api/capability";
const bridgePort = process.env.MURRMURE_BRIDGE_PORT ?? process.env.MURRMURE_BRIDGE_PORT ?? "8787";

const mountPath = pathToFileURL(join(bundlePath, "server", "mount.mjs")).href;
const mod = await import(mountPath);

const routes = [];

function matchRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const parts = route.path.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);

    if (parts[parts.length - 1] === "*") {
      const baseParts = parts.slice(0, -1);
      if (pathParts.length < baseParts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < baseParts.length; i++) {
        if (baseParts[i].startsWith(":")) {
          params[baseParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (baseParts[i] !== pathParts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        params["*"] = pathParts.slice(baseParts.length).join("/");
        return { handler: route.handler, params };
      }
      continue;
    }

    if (parts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) {
        params[parts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (parts[i] !== pathParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler: route.handler, params };
  }
  return null;
}

function addRoute(method, path, handler) {
  routes.push({ method, path, handler });
}

function createContext(requestHeaders) {
  const hub = createHubBridge({
    bridgeUrl: `http://127.0.0.1:${bridgePort}`,
    workerToken: process.env.MURRMURE_WORKER_TOKEN ?? process.env.MURRMURE_WORKER_TOKEN ?? "",
    getRequestHeaders: () => requestHeaders,
  });

  return {
    spaceId: process.env.MURRMURE_SPACE_ID ?? process.env.MURRMURE_SPACE_ID ?? "",
    installId: process.env.MURRMURE_INSTALL_ID ?? process.env.MURRMURE_INSTALL_ID ?? "",
    packageId: process.env.MURRMURE_FLOW_ID ?? process.env.MURRMURE_FLOW_ID ?? "",
    flowId: process.env.MURRMURE_FLOW_ID ?? process.env.MURRMURE_FLOW_ID ?? "",
    version: process.env.MURRMURE_VERSION ?? process.env.MURRMURE_VERSION ?? "",
    routesPrefix: prefix,
    contractRefId: process.env.MURRMURE_CONTRACT_REF_ID ?? process.env.MURRMURE_CONTRACT_REF_ID ?? "",
    hub,
    getInstallConfig: () => hub.getInstallConfig(),
  };
}

function makeHonoCtx(req, res, params, body, requestHeaders, pathname) {
  const ctx = createContext(requestHeaders);
  return {
    json: (data, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
      return data;
    },
    text: (data, status = 200, contentType = "text/plain; charset=utf-8") => {
      res.writeHead(status, { "content-type": contentType });
      res.end(String(data));
    },
    req: {
      path: pathname,
      param: (name) => params[name],
      query: (name) => new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get(name),
      header: (name) => requestHeaders[name.toLowerCase()],
      json: async () => body,
      raw: req,
    },
    ...ctx,
  };
}

const app = {
  get(path, handler) {
    addRoute("GET", path, handler);
  },
  post(path, handler) {
    addRoute("POST", path, handler);
  },
  put(path, handler) {
    addRoute("PUT", path, handler);
  },
  delete(path, handler) {
    addRoute("DELETE", path, handler);
  },
  patch(path, handler) {
    addRoute("PATCH", path, handler);
  },
  route() {
    /* stub */
  },
};

const baseCtx = createContext({});
if (typeof mod.mountRoutes === "function") {
  mod.mountRoutes(app, baseCtx);
} else {
  addRoute("GET", "/health", () => ({ ok: true, package: baseCtx.packageId }));
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1`);
  let pathname = url.pathname;
  if (pathname.startsWith(prefix)) pathname = pathname.slice(prefix.length) || "/";

  const requestHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") requestHeaders[k.toLowerCase()] = v;
  }

  const matched = matchRoute(req.method ?? "GET", pathname);
  if (!matched) {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    void (async () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const c = makeHonoCtx(req, res, matched.params, parsed, requestHeaders, pathname);
        const out = await Promise.resolve(matched.handler(c));
        if (!res.writableEnded) {
          if (out !== undefined) {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(out));
          } else {
            res.writeHead(204);
            res.end();
          }
        }
      } catch (e) {
        if (!res.writableEnded) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(e), code: e?.code }));
        }
      }
    })();
  });
}).listen(port, "127.0.0.1", () => {
  process.stdout.write("ready\n");
});
