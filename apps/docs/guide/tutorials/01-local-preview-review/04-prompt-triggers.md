# Part 4 — Space handlers

**Handlers** wire execution to protocol steps. A qualified
**`on: step.opened::{flow}.{step}`** selects the resolver; optional
**`contract_keys`** scope the generated prompt. **`complete: explicit`** means
the agent (or `mrmr step resolve`) resolves the step.

The space owns *what runs* when Murrmure opens an agent step — not the flow manifest.

## Step 1 — Contract keys index

After your first `mrmr space apply`, the CLI writes `.mrmr/dev/contracts/contract-keys.json` — a flat list of keys your handlers must cover:

```json
[
  {
    "key": "preview-review.write_spec",
    "flow_ref": "preview-review",
    "step_id": "write_spec",
    "branches": ["completed", "failed"]
  }
]
```

Use this file while authoring to choose prompt scope. Resolver dispatch is
controlled only by the qualified `on` binding; an unbound step remains open for
authorized protocol clients.

Run `mrmr space doctor` to catch uncovered steps before you share the space.

## Step 2 — Handler file

`.mrmr/space/handlers.yaml`:

```yaml
version: 1

x-agent-cmd: &agent_cmd cursor agent -p --force --approve-mcps --trust --output-format stream-json --stream-partial-output

handlers:
  - id: feature_write_spec
    contract_keys: [preview-review.write_spec]
    on: step.opened::preview-review.write_spec
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
    on: step.opened::preview-review.build
    type: shell_spawn
    complete: explicit
    params:
      spec_filename: "{{input.spec_filename}}"
      spec_path: "specs/current/{{input.spec_filename}}"
    prompt: |
      Follow `skills/feature-build/SKILL.md` (parent-owned build ⇄ review loop).

      Spec: `{{spec_path}}` (repo copy — not intake temp file)
      Dev server: `npm run dev` → http://localhost:3000

      Open one declared child with murrmure_open_child_step.
      On resumed return, inspect returned_child and open the next child or
      resolve parent build with murrmure_resolve_step.
    command: *agent_cmd
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000

  - id: feature_build_loop
    contract_keys: [preview-review.build.build-loop, preview-review.build.review]
    on: step.opened::preview-review.build.build-loop
    type: shell_spawn
    complete: explicit
    prompt: |
      Implement or revise the site, then resolve only build.build-loop with
      murrmure_resolve_step and a schema-valid preview_url.
    command: *agent_cmd
    cwd: "{{space_root}}"
    delivery: fail_fast
    timeout_ms: 3600000

  - id: review_view
    on: step.opened::preview-review.build.review
    type: view_resolver
    view: preview-review

  - id: feature_archive
    contract_keys: [preview-review.archive]
    on: step.opened::preview-review.archive
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
    on: step.opened::preview-review.commit
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
| `feature_build` | `preview-review.build`, `.build-loop`, `.review` | Choose one child from each opened/resumed parent assignment |
| `feature_build_loop` | `.build-loop`, `.review` | Build or revise and resolve the assigned child |
| `review_view` | — | Let the human resolve the review child |
| `feature_archive` | `preview-review.archive` | Move spec current → archive |
| `feature_commit` | `preview-review.commit` | Git commit + message + description JSON |

### Dispatch on `step.opened`

When a step opens or a parent resumes, Murrmure dispatches its exclusive
`on: step.opened::{flow}.{step}` binding. `contract_keys` controls prompt scope;
it does not dispatch. The assignment includes live protocol context and the
active contract path.

### `complete: explicit`

The handler does **not** auto-resolve when the subprocess exits. The agent must call **`murrmure_resolve_step`** (MCP) or you can resolve from shell scripts with **`mrmr step resolve`**:

```bash
mrmr step resolve --branch completed --payload-json '{"preview_url":"http://localhost:3000"}'
```

Other completion modes exist (`auto`, `cli`) for headless scripts — this tutorial uses **`explicit`** for all agent steps.

### Build is special

**Build** is a sequence of exclusive assignments:

- successful child activation yields the parent and ends its process assignment;
- child return dispatches the same parent binding again with `reason: resumed`;
- the new contract contains `returned_child`, so no process or credential must
  survive across the yield.

### What Murrmure does not do

- Parse the spec
- Discover preview URLs
- Run git or move files itself

That is all **agent** work guided by handler prompt + `agent.md` + skill.

## Step 4 — Swap harness later

Change only `command:` to use another agent CLI — flow manifest and `contract_keys` stay the same.

## Checkpoint

- [ ] Each step has at most one qualified `step.opened::…` resolver binding
- [ ] Agent handlers use `complete: explicit`
- [ ] Parent and child build handlers are separate, exclusive assignments
- [ ] No `executor.action` in the flow manifest (Part 5)

## Next

[Part 5 — Flow manifest →](./05-flow-manifest)
