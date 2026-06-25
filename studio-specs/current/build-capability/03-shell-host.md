# BC3 — Shell host (platform UI boundary)

Platform shell renders **Configure**, **thin runtime chrome**, and a **sandboxed capability canvas**. Domain UI runs in hub-served iframe — not shell origin.

> **Security:** [09-security-execution-boundaries.md](./09-security-execution-boundaries.md) · **Routing:** [10-routing-collision-and-canvas-resolution.md](./10-routing-collision-and-canvas-resolution.md)

---

## What stays in `@murrmure/shell-web`

| Area | Routes / components | Data source |
|------|---------------------|-------------|
| **Connect / login** | `/connect`, `/login` | hub health, token |
| **Configure** | `/configure/**` | hub-client config APIs |
| **Runtime chrome** | Top bar: space picker, hub status, Runtime \| Configure toggle | `auth.whoami` |
| **Runtime sidebar** | Instances, gates, event tail, audit | platform queries |
| **Capability canvas host** | Manifest `ui.canvas_route` | iframe → hub `ui/shell.html` |

## What leaves the platform repo

| Removed | Replaced by |
|---------|-------------|
| `@studio/review-ui`, `@studio/feature-spec-ui` | User bundle in iframe |
| Dynamic `import()` of user ESM in shell origin | iframe + postMessage bridge |
| Hardcoded review layout | Manifest-driven routes |

---

## Layout (runtime)

```
┌──────────────────────────────────────────────────────────────┐
│ SHELL: [Space ▾]  [Hub ●]  [Runtime | Configure]             │
├─────────────┬────────────────────────────────────────────────┤
│ SHELL:      │ ┌─ iframe (opaque origin, sandboxed) ──────┐ │
│ instances   │ │  USER CAPABILITY UI (100% user bundle)    │ │
│ gates       │ │  preview, forms, domain actions             │ │
│ events      │ └────────────────────────────────────────────┘ │
└─────────────┴────────────────────────────────────────────────┘
```

---

## CapabilityCanvasHost

1. Resolve instance → live manifest
2. Set iframe `src={hub}/capabilities/{pkg}/{ver}/ui/shell.html?instance={id}`
3. `sandbox="allow-scripts"` — **no** `allow-same-origin`
4. On `load`: postMessage `{ type: "init", ctx: CapabilityHostContextPublic }`
5. Proxy `hub-fetch` messages with short-lived derived token
6. On SSE `capability.dev_reload` / `capability.live_applied` → postMessage `{ type: "reload" }` or refresh iframe

**No** dynamic `import()` of user code in shell bundle.

---

## Bundled / desktop mode

When the shell is built with `VITE_MURRMURE_BUNDLED=1` and served by the hub static mount (`/`):

1. Shell hub URL resolution is same-origin (`window.location.origin`), and Connect/Setup do not show editable hub URL input.
2. Canvas iframe source uses a relative route: `/flows/{packageId}/{version}/ui/shell.html?instance={id}`.
3. `init` host context still carries `hubUrl`, but in bundled mode it is the same origin.
4. `hub-fetch` forwarding in `FlowCanvasHost` is restricted to `/api/{packageId}/...`; other paths are rejected.

This keeps flow behavior unchanged while removing desktop hub URL setup.

---

## Configure: New capability (BC2a)

Route: `/configure/spaces/:spaceId/capabilities/new`

Static onboarding (no catalog picker):

1. `npm install -D @studio/capability-sdk`
2. `studio capability init <id> --dir …`
3. Author in IDE → `validate` → `build` → `push`
4. Link to install detail after push

**BC6b (later):** directory picker → `shared.json` `capabilityProjects`.

Install detail shows `source_path`, `bundle_digest`, `built_at` from push metadata (UX-05).

Contract diff read-only from blob-stored contract.

---

## Error states (UX-07)

| State | User message | Action link |
|-------|--------------|-------------|
| No live capability | "Workflow not deployed" | Configure → capabilities |
| iframe 404 | "UI bundle missing — run apply" | Install detail → Apply |
| `LIVE_APPLY_FAILED` | "Mount failed — prior version still live" | Retry apply, hub logs |
| Worker spawn fail | "Server handler failed to start" | Validate + push again |
| User mount throws | Error boundary: package + version | Contact builder |
| Preview policy block | Platform banner | Space settings |
| CSP violation | "Capability UI blocked external script" | Fix bundle or policy |

---

## BC3 definition of done

- [ ] Zero `*-ui` imports in shell
- [ ] User UI in sandboxed iframe with postMessage bridge
- [ ] BC2a New capability page live
- [ ] Gate queue + instances work without canvas loaded
