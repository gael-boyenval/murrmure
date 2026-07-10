# Creating a flow

::: tip Start here
**New workflows** use a **`.mrmr/`** directory indexed with **`mrmr space apply`**.

→ **[Tutorial 1a — First flow (v3)](./tutorials/01-local-preview-review-v3/)** — launch Desktop, two-step flow (`intake` → `write_spec`), understand runs and the journal (3 parts).

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
mrmr grant mint --space spc_… --capabilities flow:run,flow:read,step:resolve,space:read
```

See [Tutorial 1a](./tutorials/01-local-preview-review-v3/) for the minimal path, or [Tutorial 1b — Create the repo](./tutorials/01-local-preview-review/01-create-the-repo) and [Flow manifest](./tutorials/01-local-preview-review/05-flow-manifest) for the full walkthrough.

## Step contracts (v2.2)

New flows use a **unified step shape** (`branches`, optional `presentation`, optional nested `steps`) instead of separate `invoke:` / `checkpoint:` blocks.

- **Normative bridge:** [step-contract.md](https://github.com/murrmure/agentStudio/blob/main/studio-specs/current/bridges/step-contract.md) (monorepo `studio-specs/current/bridges/step-contract.md`)
- **Apply:** `mrmr space apply` compiles a **StepContractCatalog** and prints a digest; `--strict` rejects legacy manifests and unknown `&#123;&#123;murrmure.*&#125;&#125;` template tokens.
- **Runtime:** resolve via **`murrmure_resolve_step`** (MCP) or **`mrmr step resolve`** (shell). See [Space handlers](./space-handlers).

```yaml
# excerpt — see bridge for full nested preview-review manifest
steps:
  - id: intake
    presentation: { view: preview-review-intake }
    branches:
      continue: { schema: { type: object }, next: write_spec }
      cancel: { schema: { type: object }, next: null, fail_run: true }
```

## What you build (v2)

| Piece | Location |
|-------|----------|
| Flow manifest | `.mrmr/flows/{name}/flow.manifest.yaml` |
| Handlers | `.mrmr/space/handlers.yaml` (`contract_keys`, `shell_spawn`, …) |
| Checkpoint views | `.mrmr/views/{id}/` (Vite+React + `view.manifest.yaml`) |
| Local dev outputs | `.mrmr/dev/` (contract-keys codegen, gitignored) |

Checkpoint steps with `presentation.view` open in **ViewCanvasHost** — see [View SDK](../reference/view-sdk).

## Related

- [Tutorial 1a: first flow](./tutorials/01-local-preview-review-v3/) — **start here (3 parts)**
- [Tutorial 1b: local preview-review](./tutorials/01-local-preview-review/) — **full guide**
- [Space handlers & contract keys](./space-handlers) — execution authoring
- [Space index](./space-index) — layout reference
- [Agent skill](./agent-skill) — split Cursor skills
- [Admin commands (CLI)](./configuration) — apply + grants
- [CLI](./cli) — platform CLI
- [HTTP API](../reference/http-api) — apply, runtime, gates
