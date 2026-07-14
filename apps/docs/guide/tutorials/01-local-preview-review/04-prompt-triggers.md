# Part 4 — Space handlers

::: warning Retired v2 handler model
This page teaches the **retired v2 handler model** (`contract_keys` dispatch, bare `on: step.opened`, `kill_on: step.resolved`) — **rejected by current strict validation**. Use the v3 `on::key` binding instead. See **[Tutorial 1a (v3)](../01-local-preview-review-v3/)** and [Space handlers](../../space-handlers.md).
:::

**Handlers** wire execution to protocol steps. Each handler declares **`contract_keys`** that match steps in your flow manifest, **`on: step.opened`** to dispatch when a step opens, and **`complete: explicit`** so the agent (or `mrmr step resolve`) must resolve the step.

The space owns *what runs* when Murrmure opens an agent step — not the flow manifest.

## Step 1 — Contract keys index

After your first `mrmr space apply`, the CLI writes `.mrmr/dev/contracts/contract-keys.json` — a flat list of keys your handlers must cover:

```json
[
  {
    "key": "preview-review.write_spec",
    "flow_ref": "preview-review",
    "step_id": "write_spec",
    "role": "agent",
    "branches": ["completed", "failed"]
  }
]
```

Use this file while authoring. Each agent step needs at least one handler whose `contract_keys` includes its key (e.g. `preview-review.build` for the **build** parent, plus nested keys like `preview-review.build.build-loop` when one handler owns the subgraph).

Run `mrmr space doctor` to catch uncovered steps before you share the space.

## Step 2 — Handler file

`.mrmr/space/handlers.yaml`:

```yaml
version: 1

x-agent-cmd: &agent_cmd cursor agent -p --force --approve-mcps --trust --output-format stream-json --stream-partial-output

handlers:
  - id: feature_write_spec
    contract_keys: [preview-review.write_spec]
    on: step.opened
    type: shell_spawn
    complete: explicit
    params:
      spec_path: "{{murrmure.step.intake.artifact.spec.path}}"
      spec_filename: "{{input.spec_filename}}"
    prompt: |
      Copy intake spec to `specs/current/{{spec_filename}}`.
      Source: {{spec_path}}
      Then: `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "write_spec", branch: "completed" })`
    command: *agent_cmd
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000

  - id: feature_build
    contract_keys:
      - preview-review.build
      - preview-review.build.build-loop
      - preview-review.build.review
    on: step.opened
    kill_on: step.resolved
    type: shell_spawn
    complete: explicit
    params:
      spec_filename: "{{input.spec_filename}}"
      spec_path: "specs/current/{{input.spec_filename}}"
    prompt: |
      Follow `skills/feature-build/SKILL.md` (build ⇄ review loop).

      Spec: `{{spec_path}}` (repo copy — not intake temp file)
      Dev server: `npm run dev` → http://localhost:3000

      You own nested step `build.build-loop` (resolve with preview_url).
      Human owns `build.review` — use `murrmure_wait_for_run`, never resolve review.
      On changes_required: fix, resolve build.build-loop again.
    command: *agent_cmd
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000

  - id: feature_archive
    contract_keys: [preview-review.archive]
    on: step.opened
    type: shell_spawn
    complete: explicit
    params:
      spec_filename: "{{input.spec_filename}}"
    prompt: |
      Move `specs/current/{{spec_filename}}` → `specs/archive/{{spec_filename}}`.
      Then: `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "archive", branch: "completed", payload: { archived_path: "specs/archive/{{spec_filename}}" } })`
    command: *agent_cmd
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000

  - id: feature_commit
    contract_keys: [preview-review.commit]
    on: step.opened
    type: shell_spawn
    complete: explicit
    params:
      spec_filename: "{{input.spec_filename}}"
    prompt: |
      Git commit all changes for spec `{{spec_filename}}`.
      Then: `murrmure_resolve_step({ run_id: "{{run_id}}", step_id: "commit", branch: "completed", payload: { commit_message: "…", description: "…" } })`
    command: *agent_cmd
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000
```

## Step 3 — Read each handler

| Handler | `contract_keys` | Agent job |
|---------|-----------------|-----------|
| `feature_write_spec` | `preview-review.write_spec` | Copy intake artifact to `specs/current/` |
| `feature_build` | `preview-review.build`, `.build-loop`, `.review` | Code site; nested loop via `resolve_step` + `wait_for_run` |
| `feature_archive` | `preview-review.archive` | Move spec current → archive |
| `feature_commit` | `preview-review.commit` | Git commit + message + description JSON |

### Dispatch on `step.opened`

When the engine opens an agent step, Murrmure finds handlers whose `contract_keys` match the step's contract key and `on` includes `step.opened`. It expands the `prompt:` template, injects protocol context (run/session ids, step contract slice, `active-step-contract.json` path), sets env bindings, and runs `command:` in `cwd:`.

### `complete: explicit`

The handler does **not** auto-resolve when the subprocess exits. The agent must call **`murrmure_resolve_step`** (MCP) or you can resolve from shell scripts with **`mrmr step resolve`**:

```bash
mrmr step resolve --branch completed --payload-json '{"preview_url":"http://localhost:3000"}'
```

Other completion modes exist (`auto`, `cli`) for headless scripts — this tutorial uses **`explicit`** for all agent steps.

### Build is special

**Build** is a long-lived shell session:

- **`kill_on: step.resolved`** — subprocess ends when parent **build** resolves (after human validates)
- Handler covers nested keys so one dispatch owns **`build.build-loop`** and waits through **`build.review`**
- Agent re-reads `.mrmr/dev/runs/{run_id}/active-step-contract.json` after engine transitions

### What Murrmure does not do

- Parse the spec
- Discover preview URLs
- Run git or move files itself

That is all **agent** work guided by handler prompt + `agent.md` + skill.

## Step 4 — Swap harness later

Change only `command:` to use another agent CLI — flow manifest and `contract_keys` stay the same.

## Checkpoint

- [ ] Four handlers with matching `contract_keys` from `contract-keys.json`
- [ ] All agent handlers use `on: step.opened` and `complete: explicit`
- [ ] Build handler has `kill_on: step.resolved` and references `skills/feature-build/SKILL.md`
- [ ] No `executor.action` in the flow manifest (Part 5)

## Next

[Part 5 — Flow manifest →](./05-flow-manifest)
