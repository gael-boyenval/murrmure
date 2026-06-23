# Security and execution boundaries

**Status:** normative (2026-06-20)  
**Resolves:** ARCH-01, ARCH-02 (P0)

---

## Threat model

| Asset | Risk |
|-------|------|
| Hub DB, all spaces | User server bundle is **untrusted code** |
| Shell session, derived tokens | User UI bundle is **untrusted script** |
| Builder machine | Trusted author; push requires `capability:install` |

**Assumption v1:** Builders with install scope are trusted **on sandbox**; prod promote is human-gated. Untrusted code still must not escape isolation (defense in depth).

---

## Server execution (ARCH-01)

### v1 decision: capability worker subprocess

User `server/mount.mjs` **never** loads in hub main process.

```
Hub main process
  → CapabilityWorkerPool.spawn(digest, routes_prefix)
  → Unix socket / localhost HTTP to worker
  → Worker dynamic import mount.mjs (limited env)
  → Hub proxies /api/… to worker
```

| Property | Value |
|----------|-------|
| Worker lifetime | Per live apply; killed on unmount/rollback |
| Worker FS | Read-only blob dir for that digest only |
| Worker env | `STUDIO_SPACE_ID`, `STUDIO_INSTALL_ID` — no hub auth tokens |
| Hub→worker auth | Local socket token rotated per spawn |

**Rejected v1:** in-process `import()` (P0), Node `vm` alone (insufficient).

**Future:** WASM handlers, signed bundles (OD-S1 sidecar).

---

## UI execution (ARCH-02)

### v1 decision: sandboxed iframe + hub origin

Shell **does not** `import()` user `entry.js` in shell origin.

```
Shell (app origin)
  └─ iframe src="{hub}/capabilities/{pkg}/{ver}/ui/shell.html"
       sandbox="allow-scripts"
       (no allow-same-origin — opaque origin)
       postMessage ↔ CapabilityHostBridge
```

`ui/shell.html` (in bundle) loads `entry.js` from same hub static path.

### CapabilityHostBridge (shell)

| Direction | Payload |
|-----------|---------|
| shell → iframe | `{ type: "init", ctx: CapabilityHostContextPublic }` |
| iframe → shell | `{ type: "hub-fetch", id, path, init }` (proxied; short-lived token) |
| shell → iframe | `{ type: "reload" }` on dev/live apply |

`CapabilityHostContextPublic` excludes MCP tokens and admin scopes.

### CSP

Hub static UI route:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' {hub}
```

User bundle cannot load external scripts unless space `preview_policy` allows (domain capability iframes inside canvas are separate).

---

## Push trust

| Control | Rule |
|---------|------|
| Who may push | `capability:install` + install_policy |
| Agent push | Sandbox spaces only (PAR-03) |
| Digest | Hub-computed (ARCH-04) |
| Path allowlist | `local-path` roots only under `~/.studio/capabilities/` |

---

## Denial codes (security)

| Code | When |
|------|------|
| `LOCAL_PATH_DENIED` | Path traversal / outside allowlist |
| `BUNDLE_DIGEST_MISMATCH` | Tampered upload |
| `LIVE_APPLY_FAILED` | Worker spawn/import failure |
| `CANVAS_SANDBOX_VIOLATION` | iframe navigation escape attempt (logged) |

---

## Related

- [03-shell-host.md](./03-shell-host.md)
- [04-hub-ingest.md](./04-hub-ingest.md)
- [08-auth-profiles-local-cloud-ci.md](./08-auth-profiles-local-cloud-ci.md)
