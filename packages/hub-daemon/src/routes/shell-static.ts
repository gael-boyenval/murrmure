import type { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { DaemonContext } from "../context.js";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const EXCLUDED_PREFIXES = ["/v1", "/api", "/flows", "/internal"];

function isExcludedPrefix(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function resolveFilePath(root: string, requestedPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    return null;
  }
  const filePath = normalize(join(root, decodedPath));
  if (filePath !== root && !filePath.startsWith(root + "/")) {
    return null;
  }
  return filePath;
}

function readStaticFile(filePath: string): Response | null {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const ext = extname(filePath);
    const body = readFileSync(filePath);
    return new Response(body, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
      },
    });
  } catch {
    return null;
  }
}

export function mountShellStaticRoutes(app: Hono, ctx: DaemonContext): void {
  if (!ctx.config.shellStaticDir) {
    return;
  }

  const staticRoot = normalize(ctx.config.shellStaticDir);
  app.get("*", (c) => {
    if (isExcludedPrefix(c.req.path)) {
      return c.notFound();
    }

    const requestedPath = c.req.path === "/" ? "index.html" : c.req.path.replace(/^\/+/, "");
    const resolvedPath = resolveFilePath(staticRoot, requestedPath);
    if (!resolvedPath) {
      return c.notFound();
    }
    const direct = readStaticFile(resolvedPath);
    if (direct) {
      return direct;
    }

    const fallbackPath = resolveFilePath(staticRoot, "index.html");
    if (!fallbackPath) {
      return c.notFound();
    }
    const fallback = readStaticFile(fallbackPath);
    if (fallback) {
      return fallback;
    }

    return c.notFound();
  });
}
