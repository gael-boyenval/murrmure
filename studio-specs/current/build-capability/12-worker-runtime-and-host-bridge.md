# Worker runtime, router, and host-bridge

**Status:** normative (2026-06-22)
**Resolves:** ARCH-01 (server isolation) execution detail; debundle contract for stateful capabilities
**Packages:** `packages/studio-hub-daemon/src/capability-worker-pool.ts`, `capability-worker-entry.js`, `routes.ts`, `routes/capability-static.ts`, `live-apply.ts`

This document specifies the capability worker runtime: how a bundled capability's
`server/mount.mjs` is executed out-of-process, how the hub routes HTTP, MCP, and
cross-space traffic to it, and the **host-bridge** a worker uses to call back into
the hub. It separates what is **implemented in v1** from what is **required to
fully debundle** the stateful reference capabilities (`feature-spec`,
`review-loop`) from the hub process into worker bundles.

> **Debundle complete (2026-06-22).** `feature-spec` and `review-loop` run as
> worker bundles from `examples/capabilities/` via CDK install + live apply.
> Host-bridge (`ctx.hub`) is the sole kernel access path for stateful capabilities.
> See [plans/README.md](../../plans/README.md) for migration history.

---

## 1. Worker process model (implemented)

User `server/mount.mjs` **never** loads in the hub main process. On live apply of
a bundle install, the hub spawns one worker per `(package_id, bundle_digest)`:

```
live-apply(install)
  → CapabilityWorkerPool.spawn({ packageId, digest, blobPath, routesPrefix, … })
  → node <hub>/capability-worker-entry.js --port <p> --bundle <blobPath> --prefix <routes_prefix>
  → worker: dynamic import(blobPath/server/mount.mjs); listen on 127.0.0.1:<p>
  → worker writes "ready\n" to stdout; hub resolves spawn (5 s timeout else reject)
```

| Property | Value |
|----------|-------|
| Entry | `capability-worker-entry.js` — **plain JavaScript** (spawned with the bare `node` binary, no `tsx` loader; must contain no TypeScript syntax) |
| Worker lifetime | Created on first live apply for a digest; reused for that digest; killed on intentional unmount/rollback/shutdown; **auto-unmount on unexpected exit** |
| Transport | `127.0.0.1` HTTP on a worker-chosen port |
| Worker FS | Read-only blob dir for that digest (`blobs/capability/<digest>`) |
| Worker env | Allowlisted host vars (`PATH`, `HOME`, `TMPDIR`, …) **plus** `STUDIO_SPACE_ID`, `STUDIO_INSTALL_ID`, `STUDIO_PACKAGE_ID`, `STUDIO_VERSION`, `STUDIO_CONTRACT_REF_ID`. No hub auth tokens, no inherited secrets (`sanitizedWorkerEnv`). |

The worker entry exposes a minimal Hono-shaped `app` (`get`/`post`) to the bundle
so `mountRoutes(app, ctx)` works unmodified; requests strip `routes_prefix`
before matching.

### Required for debundle

- **Per-spawn worker token.** The hub must mint a short-lived local token, pass
  it to the worker via env, and require it on the host-bridge callback channel so
  another local process cannot drive a worker or impersonate the hub.
- **Crash supervision.** Worker exit before/after `ready` must surface as
  `LIVE_APPLY_FAILED` (pre-ready, implemented via spawn timeout) and as an
  automatic unmount + journal `capability.unmounted` (post-ready crash, required).

---

## 2. Worker router (implemented)

Hono builds its route matcher on first request and **forbids adding routes after
that**. Live apply therefore must not register per-worker routes. Instead the hub
registers a **single dynamic dispatcher once** at app construction:

```ts
// routes.ts — registered before in-process capability routes
app.all("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const mount = ctx.mountRegistry.listAll().find(
    (m) => m.bundle_digest &&
      (path === m.routes_prefix || path.startsWith(`${m.routes_prefix}/`)),
  );
  if (!mount?.bundle_digest) return next();          // fall through to in-process routes
  const worker = ctx.workerPool.get(mount.package_id, mount.bundle_digest);
  if (!worker) return next();
  // proxy method/headers/body to 127.0.0.1:<worker.port><path>
});
```

| Rule | Value |
|------|-------|
| Match | First live **bundle** mount whose `routes_prefix` equals or prefixes the request path |
| Fallthrough | No bundle match → `next()` so in-process capability routes (`/api/sessions`, `/api/specs`) still resolve |
| Prefix | Bundle `routes_prefix` is `/api/<package_id>`; collisions denied at apply (`ROUTE_PREFIX_COLLISION`) |

> The literal `GET /v1/spaces/:id/capabilities/live` route is registered before
> the `:install_id` param route so it is not shadowed.

### Required for debundle

- **Space-scoped worker lookup.** Workers are keyed by `(package_id, digest)` and
  shared across spaces; the dispatcher resolves by prefix only. A debundled
  stateful capability serving multiple spaces requires either per-space worker
  identity on the request or a per-space worker instance, so the worker acts on
  the caller's space rather than the spawn-time `STUDIO_SPACE_ID`.

---

## 3. Public UI blob route (implemented)

```
GET /capabilities/{package_id}/{version}/ui/*   → blobs/capability/<digest>/ui/<rest>
```

Serves `shell.html`, `entry.js`, and assets for the sandboxed iframe. Responses
set `Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src
'self'`. The resolved file path **must** stay within the bundle `ui/` directory
(normalize and reject `..` traversal). Unknown package/version or missing file →
`404`.

---

## 4. MCP tool dispatch to workers (required for debundle)

Today bundle MCP tools are **listed** in the catalog (`McpToolRegistry.listForToken`
reads `mount.mcp_tools`) but there is **no handler** that invokes a worker — only
platform and in-process capability handlers are registered. A debundled capability
needs its MCP `tools/call` to reach the worker:

```
tools/call(name, args, ctx)
  → authorizeTool (ACL + scope, unchanged)
  → resolve mount for tool name → (package_id, digest)
  → look up contract/mcp-tools.json: tools[name].http = { method, path }
  → host-authenticated request to worker: <method> <routes_prefix><path>, body = args
  → return worker JSON (Zod-validated against the tool's leaf schema)
```

Normative requirements:

- The hub derives the worker call target from `contract/mcp-tools.json`, not from
  guesses; every name in `mcp_tools_by_version[live]` must have an `http` entry.
- The call carries the caller's `TokenContext` identity to the worker via the
  host-bridge headers (space, actor, install) so the worker can attribute writes.
- Tool errors map to existing denial codes; worker 5xx → tool failure (not a
  silent empty result).

---

## 5. Host-bridge: worker → hub callbacks (required for debundle)

Stateful capabilities must read and write hub instance state. A worker has **no
hub token** by design, so it cannot call the public `/v1/...` API directly. The
host-bridge is the authenticated, capped channel a worker uses to call back into
the hub on behalf of the current request's principal.

### Contract

| Aspect | Requirement |
|--------|-------------|
| Endpoint | Hub exposes an internal bridge (loopback HTTP or IPC) reachable only from spawned workers |
| Auth | Per-spawn worker token (§1) identifies the worker; the hub re-derives the acting principal from the inbound request the worker is handling, **not** from worker-supplied identity |
| Operations | `instance.get`, `instance.list`, `instance.metadata.patch`, `event.append`, `transition`, `query.get` — the same hub-core commands the platform MCP tools use, scoped to the worker's space and the caller's grant |
| Forbidden | No cross-space writes; no `space_id` override in body; no privilege beyond the caller's scopes (defense in depth even though builders are trusted on sandbox) |
| Shape | Stable typed client injected into `CapabilityServerContext` (e.g. `ctx.hub.instances.patch(...)`) so example capabilities are identical in-process and in-worker |

The host-bridge is implemented. Stateful reference capabilities (`feature-spec`,
`review-loop`) run as worker bundles under `examples/capabilities/` and reach
the hub kernel exclusively through `ctx.hub`.

---

## 6. Cross-space query dispatch to workers (required for debundle)

XS0 ([../cross-space/spec.md](../cross-space/spec.md)) defines typed `ask`/`answer`.
Some query types are owned by a capability — notably `spec_summary@1` owned by
`feature-spec`. The hub dispatches cross-space asks to the live worker via
`invokeWorkerQuery` (internal space header + worker token).

- The manifest declares `query_types_by_version: Record<semver, string[]>`
  (extension to [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md)),
  mirroring `mcp_tools_by_version`.
- On `query.ask` targeting a space whose live capability owns the `query_type`,
  the hub dispatches to that capability's worker via an `http` answer route in
  `contract/mcp-tools.json` (or a dedicated `query_routes` map), applying the
  same evaluation order: outbound → inbound allow → type registered →
  forbidden_topics → worker handler → projection strip → `_attribution`.
- Worker answers are validated against the registered type schema ∩ the ask's
  `response_schema`; violations → `SCHEMA_VIOLATION`; no answer within timeout →
  `ANSWER_TIMEOUT`.

Federation relay (XS1) remains out of scope — see
[plans/cross-space-xs1/](../../plans/cross-space-xs1/).

---

## 7. Denial codes

| Code | When |
|------|------|
| `LIVE_APPLY_FAILED` | Worker spawn/import failure or post-ready crash during apply |
| `ROUTE_PREFIX_COLLISION` | Bundle `routes_prefix` already mounted in the space |
| `MCP_TOOL_COLLISION` | Bundle MCP tool name already provided in the space |
| `LOCAL_PATH_DENIED` | Bundle local path outside allowlist (ingest) |
| `BUNDLE_DIGEST_MISMATCH` | Client-claimed digest ≠ hub-computed digest |
| `SCHEMA_VIOLATION` / `ANSWER_TIMEOUT` | Cross-space worker answer invalid / late |

---

## 8. Definition of done

### Implemented (v1, tested)

- [x] Worker subprocess spawn with readiness handshake and sanitized env
- [x] Plain-JS worker entry runnable by the bare `node` binary
- [x] Single pre-registered `/api/*` dispatcher; bundle prefix → worker proxy
- [x] Public UI blob route with CSP
- [x] Route/MCP collision checks at apply; `capabilities/live` not shadowed
- [x] Full chain push → install → validate → test → apply → live worker `/health`
      (`packages/hub-daemon/test/http/flow-runtime/phase2-full-chain.test.ts`)

### Debundle (2026-06-22)

- [x] Per-spawn worker token + host-bridge endpoint and typed `ctx.hub` client
- [x] MCP `tools/call` dispatch to worker via `mcp-tools.json` http map
- [x] `query_types_by_version` manifest field + cross-space worker dispatch
- [x] Post-ready worker crash supervision → auto-unmount + journal
- [x] Migrate `feature-spec` and `review-loop` to worker bundles; delete in-process mounts and bundled packages

### Still pending

- [ ] Space-scoped worker identity for multi-space stateful capabilities (workers keyed by `(package_id, digest)` only today)

---

## Related

- [04-hub-ingest.md](./04-hub-ingest.md) — ingest → live apply pipeline
- [09-security-execution-boundaries.md](./09-security-execution-boundaries.md) — threat model and isolation
- [07-mcp-tool-model-and-catalog-rebuild.md](./07-mcp-tool-model-and-catalog-rebuild.md) — MCP catalog
- [../flow-runtime/spec.md](../flow-runtime/spec.md) — runtime overview
- [../cross-space/spec.md](../cross-space/spec.md) — XS0 ask/answer
