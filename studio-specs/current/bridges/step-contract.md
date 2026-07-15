# Bridge — Step contracts (v3, resolver-agnostic)

**Status:** Normative — **shipped** (Tutorial v3, Tasks 03 and 07)
**Spec:** [step contracts v3](../../plans/2026-07-14-tutorial-v3-build-tasks/03-minimal-flow.md), [connected agent build](../../plans/2026-07-14-tutorial-v3-build-tasks/07-connected-agent-build.md), [ADR-007](../../ADR/ADR-007-resolver-agnostic-step-contracts.md), [ADR-013](../../ADR/ADR-013-agent-assignment-prompt-protocol.md)

Murrmure flow steps are **resolver-agnostic contracts**. A step is `id`, optional
`description`, optional `branches`, and optional nested `steps` — nothing else.
There is no `role`, `presentation`, `deriveRole`, wait kind, or resolver modality on
a step: spaces bind resolvers (handlers, views, agents) through
[handlers.md](./handlers.md) (the `on::key` binding in `.mrmr/space/handlers.yaml`;
`contract_keys` is prompt-scope only).

Flow manifests declare **protocol only** — no `executor.action`, no `invoke:` /
`checkpoint:` / `gate:` runtime kinds. **`triggers`** is the only start-condition
field; the removed `start` and flow-level `requires_view` are rejected by the parser
with no dual reader and no migration.

---

## Authoring shape (protocol-only)

The canonical minimal flow is the Tutorial Part 2 manifest — one human checkpoint
with explicit `continue` / `cancel` branches and no resolver modality:

```yaml
apiVersion: murrmure.flow/v1
name: my-dev-flow
description: My first dev workflow

triggers:
  manual: true

steps:
  - id: intake
    description: Human attaches one spec markdown file.
    branches:
      continue:
        schema:
          type: object
          required: [spec]
        artifact_slots:
          spec:
            description: The spec markdown file
            media_types: [text/markdown, text/plain]
            extensions: [.md, .markdown, .txt]
            min_bytes: 1
            max_bytes: 1048576
        route: { run: completed }
      cancel:
        schema: { type: object }
        route: { run: failed }
```

A **linear pipeline step** needs only `id` (and optional `description`); `branches`
is optional. When `branches` is omitted the compiler injects `completed` and
`failed` defaults (see [Default branches](#default-branches)).

```yaml
steps:
  - id: write_spec
    description: Agent writes spec to repo.
  - id: build
    description: Build and review.
```

**Execution binding** (space-owned, not in the flow manifest):

```yaml
# .mrmr/space/handlers.yaml
handlers:
  - id: feature_write_spec
    on: step.opened::my-dev-flow.write_spec
    type: shell_spawn
    complete: explicit
    command: cursor agent -p --force {{prompt}}
    prompt: |
      … then murrmure_resolve_step({ run_id, step_id: "write_spec", branch: "completed" })
```

A step with **no configured resolver** is valid and externally resolvable; its
projection carries `resolver: null`. The shell must not synthesize a form or
fallback control for unbound steps. See [handlers.md](./handlers.md) for the full
handler schema and contract-key rules.

### Step identity

| Scope | ID | Example |
|-------|-----|---------|
| Top-level | `{step_id}` | `write_spec`, `build` |
| Nested | `{parent}.{child}` | `build.build-loop`, `build.review` |

Contract keys use `{flow_ref}.{qualified_step_id}` — e.g. `my-dev-flow.intake`,
`preview-review.build.build-loop`. Every tutorial step has one stable contract key
that appears in the compiled catalog, IR, runtime slice, graph, and journal.

### Branch authoring (flat)

Each key under `branches` is an **outcome name** — the `branch` value passed to
`resolve_step`. A branch definition is flat: `schema`, `schema_ref`,
`artifact_slots`, and optional `route` / `resume` are sibling fields. Wrapper
shapes (`payload:`, `outcome:`) and superseded routing keys (`next`, `fail_run`,
`goto`, `fail`, `complete`, `continue`) are **rejected** by the strict schema.

```yaml
branches:
  continue:
    schema: { type: object, required: [spec] }
    artifact_slots:
      spec: { max_bytes: 1048576 }
    route: { step: build }     # open another step
  cancel:
    schema: { type: object }
    route: { run: failed }     # terminate the run
```

| Field | Effect |
|-------|--------|
| `route: { step: <id> }` | Engine opens the target step (top-level or qualified nested id) |
| `route: { run: completed }` | Run ends successfully (canonical terminal success; no `next: null`) |
| `route: { run: failed }` | Run fails |
| `resume: <ancestor_id>` | Yield control back to an already-open ancestor (nested loops); the ancestor stays open and owns its own resolution |

Names in `schema.required` that match `artifact_slots` are **file slots**, not
payload fields. Custom top-level branch names require an explicit `route`.

### Default branches

For a step with **omitted** `branches`, the compiler injects exact `completed` and
`failed` branches **before** any downstream consumer (IR, catalog, graph, runtime):

| Branch | Route |
|--------|-------|
| `completed` | Open the next top-level sibling; the last top-level step compiles to canonical terminal success (`engine: advance`) |
| `failed` | Fail the run (`engine: fail_run`) |

Injected defaults are **semantically identical** to explicitly authored
`completed` / `failed` branches — the compiled catalog entries are equal.
Explicit branch maps are **exact**: an explicit map (including a non-`completed` /
non-`failed` name) receives no implicit missing branches, and `branches: {}` is
rejected. Only omission receives defaults.

---

## Generic open-step lifecycle

A step is `open` while its memo status is `working`, and advances to `resolved`
when an authorized protocol client or space-bound handler resolves a branch. There
is no `awaiting_human` status, no `active_human_step` projection, and no gate row
for flow steps. Run detail exposes a generic **`open_steps[]`** projection:

```json
{
  "open_steps": [
    {
      "step_id": "intake",
      "parent_id": null,
      "description": "Human attaches one spec markdown file.",
      "resolver": null,
      "branches": [
        { "branch": "continue", "schema_ref": "murrmure.schemas/inline.continue.v1.json" },
        { "branch": "cancel", "schema": { "type": "object" } }
      ]
    }
  ]
}
```

`resolver` is `null` when no space handler is bound to the step; an authorized
protocol client must resolve it externally. A run may expose zero, one, or many
open steps. The shell reads `open_steps[]` to render state; it must not become a
second workflow engine or synthesize controls for unbound steps.

---

## StepContractCatalog (apply-time)

`mrmr space apply` compiles a **StepContractCatalog** per flow and stores it on the
space index entry (`step_contract_catalog`). Default branches are materialized into
the catalog so explicit and injected branches are downstream-equivalent.

```json
{
  "flow_id": "flw_my_dev_flow",
  "digest": "sha256:…",
  "graph_digest": "sha256:…",
  "step_ids": ["intake"],
  "entries": [
    {
      "step_id": "intake",
      "parent_id": null,
      "description": "Human attaches one spec markdown file.",
      "branches": {
        "continue": {
          "schema_ref": "murrmure.schemas/inline.continue.v1.json",
          "routes": [{ "engine": "advance" }]
        },
        "cancel": {
          "schema": { "type": "object" },
          "routes": [{ "engine": "fail_run" }]
        }
      },
      "artifact_slots": {
        "spec": { "max_bytes": 1048576, "media_types": ["text/markdown", "text/plain"] }
      }
    }
  ]
}
```

Each branch compiles to one canonical **`BranchResolveContract`**
(`{ step_id, branch, schema_ref?, schema?, routes }`) owned by
`@murrmure/contracts`. Route effects: `open` (open target step), `advance`
(canonical terminal success), `fail_run` (fail the run), `resume` (yield to
ancestor).

CLI surfaces the catalog digest on apply:

```text
✓ Indexed 0 handler(s), 1 flow(s) (1 changed) · catalog flw_my_dev_flow: abc123… (1 steps)
```

`mrmr space status` shows `step_contract_catalog_digest` per indexed flow.

Apply also lints handler coverage: a step with a bound handler must have exactly one
`step.opened` handler for its contract key. Unbound steps (`resolver: null`) are
valid and do not require a handler.

---

## Triggers — start conditions in the description

`triggers` is part of the flow description. It records **which kinds of starts are
allowed** — it is not an active listener. Something else (Desktop **Run**, a
schedule job, another flow, an event) must still act; the manifest only says whether
that action is valid.

| Key | Type | Meaning |
|-----|------|---------|
| `manual` | boolean | A human or CLI may request a run (Desktop **Run**, `mrmr flow run`) |
| `flow_call` | boolean | **Advertisements** that the flow may be started as a sub-flow via a `start_flow` step. Authorized `start_flow` is gated by `flow:run` + ACL inheritance, not by this flag — see below. |
| `events` | list | Event types that may start the flow, e.g. `{ type: "spec.published", source: "webhook" }` |
| `schedule` | string or `null` | Cron expression for scheduled starts; `null` = not schedulable |
| `idempotency` | string | Optional dedup key template for event/schedule starts |

`triggers: {}` means **invoke-only** for independent start surfaces: no
independent CLI / Desktop / schedule / external-event start. Authorized
orchestration invocation (`flow_call` / `start_flow` from a parent run with
`flow:run`) remains valid for **every** flow, including `triggers: {}` — it is
gated by authorization (`canExecuteFlow` / `canInvokeFlowCall`) and ACL
inheritance, not by `triggers.flow_call`. Independent-surface eligibility is
enforced consistently on every start path: manual start requires
`triggers.manual === true`; `triggers.flow_call === true` only **advertises**
the flow as callable to independent surfaces and does **not** gate authorized
`start_flow`. CLI and Desktop agree.

---

## Strict apply linter

`mrmr space apply` **hard-rejects** the following at parse time (HTTP 400, no
persist, no `--strict` needed) — the bundle never reaches the index:

| Code | Meaning |
|------|---------|
| `LEGACY_START_KEY` | Top-level `start:` is removed — use `triggers:` (including dual `start` + `triggers`) |
| `LEGACY_REQUIRES_VIEW` | `requires_view` is removed — bind Views through `handlers.yaml` |
| `LEGACY_STEP_KIND` | Step uses deprecated `invoke:` / `checkpoint:` / `gate:` |
| `REMOVED_FIELD` | Step or branch uses a removed key (`role`, `presentation`, `deriveRole`, `next`, `fail_run`, `goto`, `fail`, `complete`, `continue`, `payload`, `outcome`, …) |
| `INLINE_SCRIPT_STEP` | Flow manifest rejects inline `script` / `run` / `shell` / `command` steps |
| `EMPTY_BRANCHES` | Step declares `branches: {}` — omit branches for defaults or declare at least one |

`mrmr space apply --strict` additionally fails (exit 1) on these lint warnings;
without `--strict` they print to stdout and the apply still succeeds:

| Code | Meaning |
|------|---------|
| `CUSTOM_BRANCH_REQUIRES_ROUTE` | Custom top-level branch has no explicit `route` |
| `ROUTE_TARGET_NOT_FOUND` | `route.step` references a missing step |
| `RESUME_TARGET_NOT_ANCESTOR` | `resume` target is not an open ancestor |
| `DEAD_STEP` | Step unreachable from flow entry |
| `HANDLER_KEY_CONFLICT` | Multiple handlers match the same contract key |
| `HANDLER_ORPHAN_KEY` | Handler `contract_key` does not match any catalog step |
| `UNKNOWN_MURRMURE_TOKEN` | `{{murrmure.*}}` token not in the known set |

Known `{{murrmure.*}}` tokens:

- `murrmure.run_id`, `murrmure.space_root`, `murrmure.agentStepContract`, `murrmure.inputs.json`
- `murrmure.step.{qualified}.description|workdir|iteration`
- `murrmure.step.{qualified}.artifact.{slot}.path|transfer_id`

Legacy `{{input.*}}`, `{{origin_space}}`, `{{steps.*}}` tokens are unchanged.

---

## Resolve API

### Agent assignment prompt protocol

An executor handler with a `prompt` receives a user-authored **Task** followed by
one generated protocol block. The block begins exactly:

```text
Protocol: murrmure.agent/v1
```

The active step is compiled from the same canonical `BranchResolveContract` used
by resolve validation. Branches use deterministic name ordering and one neutral
template. Each branch contains:

- its complete compact Draft 2020-12 payload schema, recursively key-sorted;
- artifact requirements as a separate contract (never payload fields);
- the compiled `Then` control effect;
- a complete `murrmure_resolve_step` call with live `run_id`, live `step_id`,
  exact branch, and schema-valid example values.

Single-key assignments contain Contracts only. `## Discovery` and a live
`murrmure_list_step_contracts` call appear only when handler prompt scope has
more than one `contract_keys` entry. `## Session`, `## MCP tools`,
`## Resolve API`, `When ready:`, and placeholder IDs are not part of v1.

Local bridge assignments may submit files from the active step workdir with
`artifacts_out: [{ slot, path }]`. Remote/federated assignments use an authorized
upload-intent reference; the Hub never reads an agent-machine path.

See [ADR-013](../../ADR/ADR-013-agent-assignment-prompt-protocol.md).

Agents, views, and authorized protocol clients complete steps via
**`murrmure_resolve_step`** (`step:resolve` capability):

```http
POST /v1/runs/{run_id}/steps/{step_id}/resolve
```

```json
{
  "branch": "continue",
  "payload": {},
  "upload_intent_id": "upi_…",
  "idempotency_key": "optional"
}
```

CLI equivalent: `mrmr step resolve --run … --step … --branch continue`.

An unbound step (`resolver: null`) is resolvable by any token with `step:resolve`;
a token without `step:resolve` is denied (403). Journal events: `mrrmure.step.opened`,
`murrmure.step.resolved`. Step memos use `working` while open and `completed` /
`failed` once resolved — there is no `awaiting_human` status.

---

## Engine invariants

| Invariant | Behavior |
|-----------|----------|
| Monotonic memos | Terminal step memos (`completed` / `failed`) never regress via journal replay |
| Terminal run reject | `POST …/resolve` on `failed` / `completed` / `cancelled` runs → **409** `RUN_TERMINAL` |
| Late resolve reject | Resolving an already-terminal step → **409** `STEP_TERMINAL`; the same `idempotency_key` reconciles to the original terminal result, including after the run terminates |
| Handler cancel | Run failure cancels in-flight shell subprocesses and queued handler tasks |

---

## Step artifacts

Per-step scratch and stable artifact paths under `.mrmr/dev/runs/{run_id}/steps/{qualified}/`.

| Path | Role |
|------|------|
| `steps/{qualified}/work/` | Scratch while step is active |
| `steps/{qualified}/{slot}/{name}` | Stable after resolve promotes `artifacts_out` |

Every branch owns a complete resolve contract:

- `schema` is Draft 2020-12;
- required names matching same-branch `artifact_slots` become
  `artifact_required`; the rest become `payload_required`;
- a payload property and artifact slot may not share a name;
- optional slots may be omitted, but supplied files receive all slot checks;
- slots support normalized `media_types`, `extensions`, `min_bytes`,
  `max_bytes`, `min_files`, `max_files` (default 1), and `max_total_bytes`.

The shared trusted-runtime Ajv 8 wrapper enables only `date`, `time`,
`date-time`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`, `uri`,
and `uri-reference`. Remote `$ref` loading and custom executable formats are
rejected.

Views submit `File`/`Blob` objects to the trusted host. The host creates a
Hub-issued upload intent before bytes and consumes it atomically with resolve;
intent IDs and credentials never enter the iframe. Trusted local agent clients
may resolve `artifacts_out: [{ slot, path }]` only for paths inside the active
step workdir. Prompt tokens:
`{{murrmure.step.{qualified}.artifact.{slot}.path}}` and `.transfer_id`.

Contract failures use:

```json
{
  "code": "CONTRACT_VALIDATION_FAILED",
  "errors": [
    {
      "source": "artifact",
      "path": "/files/spec",
      "rule": "min_files",
      "message": "Artifact slot 'spec' requires at least 1 file(s)"
    }
  ]
}
```

Paths are RFC 6901 JSON Pointers. Raw validator internals, content, credentials,
schema paths, and host paths are never returned.

---

## Migration from the v2.2 shape

The clean target removes the v2.2 modality and routing fields with **no dual parser
and no migration**:

1. Replace `start: { … }` with `triggers: { … }` (the only start-condition field).
2. Remove `requires_view`; bind Views through `.mrmr/space/handlers.yaml`.
3. Remove `role`, `presentation`, `deriveRole` from every step.
4. Replace `next: <id>` / `next: null` with `route: { step: <id> }` /
   `route: { run: completed }`; replace `fail_run: true` / `fail: true` with
   `route: { run: failed }`; replace nested `goto: <id>` with `route: { step: <id> }`;
   replace `complete: parent` / `continue: parent` with `resume: <parent>`.
5. Flatten wrapper shapes — move `payload.schema` / `outcome.route` to sibling
   `schema` / `route`.
6. Omit `branches` for linear steps to receive `completed` / `failed` defaults, or
   declare explicit branches (never `branches: {}`).
7. Re-apply with `--strict`; fix linter errors. Mint a grant with `step:resolve`.

`apiVersion: murrmure.flow/v1` is the sole clean target.

---

## References

- [handlers.md](./handlers.md) — space execution binding (primary)
- [ADR-007 — resolver-agnostic step contracts](../../ADR/ADR-007-resolver-agnostic-step-contracts.md)
- [ADR-010 — branch contracts and host-mediated artifact submission](../../ADR/ADR-010-branch-contract-artifact-upload-boundary.md)
- [Tutorial v3 Task 03](../../plans/2026-07-14-tutorial-v3-build-tasks/03-minimal-flow.md)
- [action-invoke.md](./action-invoke.md) — headless invoke only (not flow steps)
- [flow-engine.md](./flow-engine.md)
