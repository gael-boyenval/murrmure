# Part 4 — Prompt triggers

**Actions** are named invoke targets. A **prompt trigger** adds a `prompt:` template and a harness `command:` — the space owns *what runs* when Murrmure fires the action.

No files in `murrmure/scripts/`.

## Step 1 — Executor binding

`murrmure/executors.yaml`:

```yaml
executors:
  shell:
    binding:
      type: shell_spawn
      executor_id: shell
```

`shell_spawn` runs a command in the **space root** (your repo). Here: `cursor agent`.

## Step 2 — Four actions

`murrmure/actions.yaml`:

```yaml
version: 1
actions:
  feature_write_spec:
    executor: shell
    prompt: |
      Follow `agent.md`. Write the spec markdown to `specs/current/{{spec_filename}}`.

      ## Spec (from human intake — not in repo yet)
      Filename: {{spec_filename}}
      ---
      {{spec_markdown}}
      ---

      Run {{run_id}} / session {{session_id}}
    command: cursor agent -p --force "{{prompt}}"
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 120000

  feature_build:
    executor: shell
    prompt: |
      Follow `agent.md` and `skills/feature-build/SKILL.md`.

      {{murrmure.agentStepContract}}

      During the loop, re-read:
        {{murrmure.space_root}}/.mrmr.temp/runs/{{murrmure.run_id}}/active-step-contract.json
    command: cursor agent -p --force "{{prompt}}"
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000

  feature_archive:
    executor: shell
    prompt: |
      Follow `agent.md`. Move `specs/current/{{spec_filename}}` → `specs/archive/{{spec_filename}}`.
      Output JSON only: {"archived_path":"specs/archive/…"}

      Run {{run_id}}
    command: cursor agent -p --force "{{prompt}}"
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 60000

  feature_commit:
    executor: shell
    prompt: |
      Follow `agent.md`. Git commit all changes for spec {{spec_filename}}.
      Output JSON only: {"commit_message":"…","description":"…"}

      Run {{run_id}}
    command: cursor agent -p --force "{{prompt}}"
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 120000
```

## Step 3 — Read each action

| Action | Flow step | Agent job |
|--------|-----------|-----------|
| `feature_write_spec` | **write_spec** | Write intake spec to `specs/current/` |
| `feature_build` | **build** | Code site; follow injected step contract + `active-step-contract.json` loop |
| `feature_archive` | **archive** | Move spec current → archive |
| `feature_commit` | **commit** | Git commit + message + description JSON |

### What the hub does

1. Expands `{{murrmure.agentStepContract}}`, `{{murrmure.run_id}}`, `{{spec_markdown}}`, etc. in the prompt
2. Sets `MURRMURE_STEP_CONTRACT`, `MURRMURE_ACTIVE_STEP_CONTRACT_PATH`, `MURRMURE_STEP_WORKDIR`, plus `MURRMURE_INVOKE_PARAMS`, `MURRMURE_INPUT`, `MURRMURE_PROMPT`
3. Runs `cursor agent -p --force "…"` in the space root
4. Journals dispatch + completion

### Build is special

**Build** is a long-lived shell session. The hub injects the active **step contract slice** at dispatch and rewrites `active-step-contract.json` on every engine transition:

1. Agent reads `{{murrmure.agentStepContract}}` in the initial prompt
2. During the loop, re-read `.mrmr.temp/runs/{run_id}/active-step-contract.json`
3. Complete steps with **`murrmure_resolve_step`**
4. Optional discovery: **`murrmure_list_step_contracts`** returns the active slice + `graph_digest`

### What Murrmure does not do

- Parse the spec
- Discover preview URLs
- Run git or move files itself

That is all **agent** work guided by prompt + `agent.md` + skill.

## Step 4 — Swap harness later

Change only `command:` to use another agent CLI — flow manifest stays the same.

## Checkpoint

- [ ] Four actions: write_spec, build, archive, commit
- [ ] Build references `skills/feature-build/SKILL.md`
- [ ] No `murrmure/scripts/`

## Next

[Part 5 — Flow manifest →](./05-flow-manifest)
