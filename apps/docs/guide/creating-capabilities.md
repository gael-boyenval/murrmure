# Creating a capability

::: tip Start here
**New workflows** use the **Capability Developer Kit (CDK)** in **your own repo** — not the Studio platform monorepo.

→ **[Complete capabilities tutorial](./capabilities-tutorial)** — scaffold, build, push, evolve, runtime canvas, dev loop.
:::

This page is a short index. The full walkthrough lives in the tutorial above.

---

## Quick path (5 commands)

```bash
npm install -D @studio/capability-sdk
studio capability init my-flow --dir ./workflows/my-flow --with-skill
cd workflows/my-flow
studio capability validate . && studio capability build .
studio capability push --space spc_ui_sandbox
```

Then in **Configure**: validate → test → promote → **apply live**. Mint agent grants with `capability_acl: ["my-flow"]`.

Optional: `studio skill install` at repo root so coding agents follow the [evolution checklist](./agent-skill).

---

## What you build

| Piece | Location |
|-------|----------|
| Manifest v1 | `capability.manifest.json` |
| ContractV2 | `contract/contract.json` |
| MCP tools | `contract/mcp-tools.json` |
| Canvas UI | `ui/src/mount.tsx` → bundled to iframe (`ui/entry.js`) |
| Static UI assets | `ui/crit/`, `ui/agent/`, fonts, CSS — copied into stage `ui/` (not bundled) |
| HTTP server | `server/index.ts` → worker `mount.mjs` |

Hub assigns `contract_ref_id`. Shell never imports your UI source — only hub-served bundles after live apply.

---

## Legacy: monorepo reference capabilities

The platform repo ships **`review-loop`** and **`feature-spec`** as CDK examples under
`examples/capabilities/`. **Do not** copy the old bundled-catalog pattern for new work:

- No edits to hub daemon source for your domain
- No `@studio/*-ui` imports in shell-web
- No in-process hub imports of your server code

Use the [tutorial](./capabilities-tutorial) instead.

---

## Related

- [Capabilities tutorial](./capabilities-tutorial) — **full guide**
- [Agent skill](./agent-skill) — Cursor skill for capability-building agents
- [Configuration](./configuration) — admin install + evolution in browser
- [CLI](./cli) — platform CLI + CDK commands
- [HTTP API](../reference/http-api) — install v2, apply, evolution
