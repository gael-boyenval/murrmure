# Creating a flow

::: tip Start here
**New workflows** use a **`.mrmr/`** directory indexed with **`mrmr space apply`**.

→ **[Tutorial 1a — First flow (v3)](./tutorials/01-local-preview-review-v3/)** — launch Desktop, intake flow, view, runs, command + agent handlers (6 parts).

→ **[Tutorial 1b — Full preview review](./tutorials/01-local-preview-review/)** — nested build/review loop, archive, commit (9 parts).

→ **[Known gaps](./known-gaps)** — deferred product surface.
:::

This page is a short index. Start with [Tutorial 1a](./tutorials/01-local-preview-review-v3/); the full walkthrough is [Tutorial 1b](./tutorials/01-local-preview-review/).

---

## Authoring path (no shortcuts)

```bash
mkdir -p ~/work/my-flow && cd ~/work/my-flow
mrmr space init
# remove flows/example — write your own under .mrmr/flows/{name}/
# edit .mrmr/space/handlers.yaml + flow.manifest.yaml
mrmr space view init my-view    # if you need checkpoint UI
cd .mrmr/views/my-view && npm install && npm run build
cd ../../..
mrmr space link --path . --create
mrmr space apply --strict
mrmr connection create --space spc_…
```

See [Tutorial 1a](./tutorials/01-local-preview-review-v3/) for the minimal path, or [Tutorial 1b — Create the repo](./tutorials/01-local-preview-review/01-create-the-repo) and [Flow manifest](./tutorials/01-local-preview-review/05-flow-manifest) for the full walkthrough.

## Step contracts (v3, resolver-agnostic)

New flows use a **resolver-agnostic step shape**: `id`, optional `description`,
optional `branches`, and optional nested `steps` — no `role`, `presentation`, or
resolver modality. Start conditions live under **`triggers`** (the only
start-condition field); the removed `start` and `requires_view` are rejected.

- **Normative bridge:** [step-contract.md](https://github.com/gael-boyenval/murrmure/blob/main/studio-specs/current/bridges/step-contract.md) (monorepo `studio-specs/current/bridges/step-contract.md`)
- **Apply:** `mrmr space apply` compiles a **StepContractCatalog** and prints a digest; `--strict` rejects removed fields, legacy step kinds, and unknown `&#123;&#123;murrmure.*&#125;&#125;` template tokens.
- **Runtime:** resolve via **`murrmure_resolve_step`** (MCP) or **`mrmr step resolve`** (shell). A step with no bound handler is open and externally resolvable (`resolver: null`). See [Space handlers](./space-handlers).

```yaml
# excerpt — see the bridge for the full manifest and default-branch rules
triggers:
  manual: true
steps:
  - id: intake
    description: Human attaches one spec markdown file.
    branches:
      continue:
        schema: { type: object, required: [spec] }
        artifact_slots:
          spec: { max_bytes: 1048576 }
        route: { run: completed }
      cancel:
        schema: { type: object }
        route: { run: failed }
```

A linear step needs only `id` (and optional `description`); omit `branches` to
receive `completed` / `failed` defaults. Spaces bind Views and handlers through
`.mrmr/space/handlers.yaml` via the **`on::key`** binding (`contract_keys` is
prompt-scope only), not through the portable flow.

## What you build (v3)

| Piece | Location |
|-------|----------|
| Flow manifest | `.mrmr/flows/{name}/flow.manifest.yaml` (`triggers`, resolver-agnostic steps) |
| Handlers | `.mrmr/space/handlers.yaml` (`on::key` binding, `shell_spawn`, …; `contract_keys` is prompt-scope) |
| Views | `.mrmr/views/{id}/` (Vite+React + `view.manifest.yaml`), bound to steps via handlers |
| Local dev outputs | `.mrmr/dev/` (contract-keys codegen, gitignored) |

Open steps surface in run detail as `open_steps[]` (`resolver: null` when no
handler is bound). The shell renders them; it does not synthesize fallback
controls for unbound steps.

## Related

- [Tutorial 1a: first flow](./tutorials/01-local-preview-review-v3/) — **start here (6 parts)**
- [Tutorial 1b: local preview-review](./tutorials/01-local-preview-review/) — **full guide**
- [Space handlers & contract keys](./space-handlers) — execution authoring
- [Space index](./space-index) — layout reference
- [Agent skill](./agent-skill) — split Cursor skills
- [Admin commands (CLI)](./configuration) — apply + grants
- [CLI](./cli) — platform CLI
- [HTTP API](../reference/http-api) — apply, runtime, gates
