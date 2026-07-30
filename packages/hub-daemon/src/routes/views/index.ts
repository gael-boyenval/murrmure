import { existsSync, readFileSync } from "node:fs";
import { join, normalize, relative, resolve } from "node:path";
import type { Hono } from "hono";
import { isLocalSpaceBinding } from "@murrmure/contracts";
import type { DaemonContext } from "../../context.js";
import { parseAccessTokenQuery, requireToken, viewAssetAuthCookieHeader } from "../../auth.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { bareSpaceId } from "../../space-id.js";

/** Same policy as view-sdk VIEW_DOCUMENT_CSP — applied as a response header
 * (not iframe `csp`, which is CSP Embedded Enforcement and blanks the frame).
 * Opaque-origin sandboxes make `'self'` match nothing, so script/style allow http(s). */
export const VIEW_ASSET_DOCUMENT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' http: https:",
  "style-src 'unsafe-inline' http: https:",
  "img-src http: https: data:",
  "font-src http: https: data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function contentType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return MIME[ext] ?? "application/octet-stream";
}

/**
 * Older Vite builds emit absolute `/assets/...` URLs which 404 when the HTML is
 * served under `/v1/spaces/.../views/.../dist/`. Rewrite to relative paths so
 * existing spaces keep working after `base: "./"` landed in the scaffold.
 */
export function rewriteAbsoluteViteAssetRefs(html: string): string {
  return html
    .replaceAll('src="/assets/', 'src="./assets/')
    .replaceAll("src='/assets/", "src='./assets/")
    .replaceAll('href="/assets/', 'href="./assets/')
    .replaceAll("href='/assets/", "href='./assets/");
}

/** Append access_token to relative asset URLs so opaque-sandbox loads auth without cookies. */
export function injectAccessTokenIntoAssetRefs(html: string, tokenId: string): string {
  const bare = tokenId.startsWith("tok_") ? tokenId : `tok_${tokenId}`;
  const q = `access_token=${encodeURIComponent(bare)}`;
  return html.replace(
    /(src|href)=(["'])(\.\/assets\/[^"'?#]+)([^"']*)\2/g,
    (_match, attr: string, quote: string, path: string, rest: string) => {
      if (rest.includes("access_token=")) {
        return `${attr}=${quote}${path}${rest}${quote}`;
      }
      const sep = rest.includes("?") ? "&" : "?";
      return `${attr}=${quote}${path}${rest}${sep}${q}${quote}`;
    },
  );
}

export function mountViewAssetRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.get("/v1/spaces/:space_id/views/:view_id/*", async (c) => {
    const space_id = c.req.param("space_id");
    const view_id = c.req.param("view_id");
    const rest = c.req.path.split(`/views/${view_id}/`)[1] ?? "";

    const auth = await requireToken(murrmurePersistence, c.req.raw, space_id);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const capCheck = requireCapability(auth, "space:read", effective);
    if (capCheck) return capCheck;

    const bare = bareSpaceId(space_id);
    const bindings = await murrmurePersistence.getSpaceBindings(bare);
    const localBindings = bindings.filter(isLocalSpaceBinding);
    const spaceRoot = localBindings.find((b) => b.primary)?.path ?? localBindings[0]?.path;
    if (!spaceRoot) {
      return c.json({ code: "SPACE_ROOT_MISSING", message: "Space has no linked root path" }, 422);
    }

    // Production Views are locally built and scaffolded under `<space>/.mrmr/views`
    // (CLI `space view init` / `view dev` / dev fixture route all use `.mrmr/views`).
    // Serve packaged/shell assets from the same canonical disk location.
    const viewRoot = resolve(join(spaceRoot, ".mrmr", "views", view_id));
    const target = normalize(resolve(viewRoot, rest));
    if (!target.startsWith(viewRoot)) {
      return c.json({ code: "PATH_TRAVERSAL", message: "Invalid view asset path" }, 400);
    }
    if (!existsSync(target)) {
      return c.json({ code: "VIEW_ASSET_NOT_FOUND", message: "View asset not found" }, 404);
    }

    const rel = relative(viewRoot, target);
    if (rel.startsWith("..")) {
      return c.json({ code: "PATH_TRAVERSAL", message: "Invalid view asset path" }, 400);
    }

    let bytes = readFileSync(target);
    const type = contentType(target);
    const headers: Record<string, string> = {
      "content-type": type,
      "cache-control": "no-store",
      "set-cookie": viewAssetAuthCookieHeader(auth.token_id),
      // Module scripts always use CORS; sandboxed opaque iframes send Origin: null.
      "access-control-allow-origin": "null",
    };

    if (type.startsWith("text/html")) {
      let html = rewriteAbsoluteViteAssetRefs(bytes.toString("utf-8"));
      html = injectAccessTokenIntoAssetRefs(html, auth.token_id);
      bytes = Buffer.from(html, "utf-8");
      headers["content-security-policy"] = VIEW_ASSET_DOCUMENT_CSP;
    }

    if (parseAccessTokenQuery(c.req.raw)) {
      headers["referrer-policy"] = "no-referrer";
    }

    return new Response(bytes, {
      status: 200,
      headers,
    });
  });
}
