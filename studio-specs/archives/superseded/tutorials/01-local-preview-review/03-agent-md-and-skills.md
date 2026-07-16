# Part 3 — Agent layer — `agent.md` and space skill

The **write / build / review / archive / commit** behavior is defined here — not in the flow YAML.

Murrmure **never reads** these files for configuration. Your **space handlers** (Part 4) tell Cursor to follow them.

## Two skill layers

| | Installed by | Teaches |
|---|--------------|---------|
| **Platform skills** | `mrmr skill install --variant agent\|developer` | Hub tools, step contracts, handlers authoring |
| **Space skill** | You, in `skills/feature-build/` | This repo's build loop, preview discovery, archive rules |

## Step 1 — Create `agent.md`

At the space root:

```markdown
# Feature site agent

## Spec lifecycle
- **Intake:** human attaches markdown from their computer (not from this repo).
- **Write spec:** handler `feature_write_spec` writes to `specs/current/{spec_filename}`.
- **Archive:** after review validates, `feature_archive` moves `specs/current/` → `specs/archive/`.
- **Commit:** `feature_commit` stages and commits site changes.

## Build (`feature_build`) — engine-routed nested review

One long Cursor session owns the review loop:

1. On parent `build`, open one declared child with
   **`murrmure_open_child_step`** and stop using that assignment.
2. On child `build.build-loop`, implement or revise the site, discover its URL,
   and resolve the child with **`murrmure_resolve_step`**.
3. On resumed parent, inspect `returned_child` and open `build.review`.
4. On `changes_required`, the next parent assignment opens a new build-loop
   iteration. On `validated`, it resolves parent `build` as completed.

## Review

Humans use the **preview-review** view at step **`build.review`**. The view reads `steps.build.build-loop.output.preview_url`.

## Archive / commit

Separate agent steps after parent **build** completes — resolve when prompted by the contract file.
```

## Step 2 — Create space skill

```bash
mkdir -p skills/feature-build
```

Write `skills/feature-build/SKILL.md` documenting the bullets in Step 2 above — same resolve/wait rules as `agent.md`.

## Step 3 — Preview URL discovery (no hub config file)

The agent discovers preview locally:

- Read `package.json` scripts, start `npm run dev`, read terminal output or probe ports
- Report whatever URL works via **`murrmure_resolve_step`** on **`build.build-loop`**
- Step output is an **opaque bag**; the review view reads `steps.build.build-loop.output.preview_url`

## Step 4 — Why Murrmure stays out of this

| Murrmure indexes | Murrmure ignores |
|----------------|------------------|
| `.mrmr/space/handlers.yaml` prompts | `agent.md` content |
| Flow step ids + `contract_keys` | Skill prose |
| View bundles | Preview URL, git messages |

You can rewrite `agent.md` tomorrow without `mrmr space apply`. Change the flow graph only when **when** steps fire needs to change; change handlers when **what runs** on each step needs to change.

## Handlers vs agent layer

| Layer | File | Owns |
|-------|------|------|
| **Protocol** | `.mrmr/flows/.../flow.manifest.yaml` | Step graph, branches, views |
| **Execution** | `.mrmr/space/handlers.yaml` | Harness command, prompt template, `contract_keys` |
| **Agent** | `agent.md`, `skills/feature-build/SKILL.md` | Domain behavior the prompt references |

Handler `prompt:` templates in Part 4 should echo the same rules as `agent.md`.

## Checkpoint

- [ ] `agent.md` describes write_spec, nested build loop, archive, commit
- [ ] `skills/feature-build/SKILL.md` documents child open, yield, return, and parent resolution
- [ ] No `preview.local.yaml` required

## Next

[Part 4 — Space handlers →](./04-prompt-triggers)
