# Part 3 — Agent layer — `agent.md` and space skill

The **write / build / review / archive / commit** behavior is defined here — not in the flow YAML.

Murrmure **never reads** these files for configuration. Your **prompt triggers** (Part 4) tell Cursor to follow them.

## Two skill layers

| | Installed by | Teaches |
|---|--------------|---------|
| **Platform skill** | `mrmr skill install` | Murrmure hub tools, step contracts, `resolve_step`, `wait_for_run` |
| **Space skill** | You, in `skills/feature-build/` | This repo's build loop, preview discovery, archive rules |

## Step 1 — Create `agent.md`

At the space root:

```markdown
# Feature site agent

## Spec lifecycle
- **Intake:** human attaches markdown from their computer (not from this repo).
- **Write spec:** `feature_write_spec` writes to `specs/current/{spec_filename}`.
- **Archive:** after review validates, `feature_archive` moves `specs/current/` → `specs/archive/`.
- **Commit:** `feature_commit` stages and commits site changes.

## Build (`feature_build`) — engine-routed nested review

One long Cursor session owns the review loop:

1. Read `specs/current/{spec_filename}` or the injected intake artifact path.
2. Implement the site; start or confirm the dev server.
3. Discover whatever local URL works (localhost, custom hostname, any port).
4. Read **`active-step-contract.json`** — resolve **`build.build-loop`** with `murrmure_resolve_step` and `{ preview_url }`.
5. **Engine opens `build.review`** — wait with **`murrmure_wait_for_run`**.
6. On `changes_required`: fix site in this session; engine reopens **`build.build-loop`** — resolve again.
7. On `validated`: exit — flow continues to archive.

## Review

Humans use the **preview-review** view at step **`build.review`**. The view reads `steps.build.build-loop.output.preview_url`.

## Archive / commit

Separate agent steps after parent **build** completes — resolve when prompted by the contract file.
```

## Step 2 — Create space skill

```bash
mkdir -p skills/feature-build
```

Copy from the reference example or write `skills/feature-build/SKILL.md` documenting:

- Contract file loop (`active-step-contract.json`, `MURRMURE_STEP_CONTRACT`)
- **`murrmure_resolve_step`** on **`build.build-loop`**
- **`murrmure_wait_for_run`** during human review
- Never resolve **`build.review`** yourself

See [preview-review-v2 example](../../../../examples/flows/preview-review-v2/skills/feature-build/SKILL.md).

## Step 3 — Preview URL discovery (no hub config file)

The agent discovers preview locally:

- Read `package.json` scripts, start `npm run dev`, read terminal output or probe ports
- Report whatever URL works via **`murrmure_resolve_step`** on **`build.build-loop`**
- Step output is an **opaque bag**; the review view reads `steps.build.build-loop.output.preview_url`

## Step 4 — Why Murrmure stays out of this

| Murrmure indexes | Murrmure ignores |
|----------------|------------------|
| `murrmure/actions.yaml` prompts | `agent.md` content |
| Flow step ids | Skill prose |
| View bundles | Preview URL, git messages |

You can rewrite `agent.md` tomorrow without `mrmr space apply`. Change the flow graph only when **when** steps fire needs to change.

## Checkpoint

- [ ] `agent.md` describes write_spec, nested build loop, archive, commit
- [ ] `skills/feature-build/SKILL.md` documents `resolve_step` + `wait_for_run`
- [ ] No `preview.local.yaml` required

## Next

[Part 4 — Prompt triggers →](./04-prompt-triggers)
