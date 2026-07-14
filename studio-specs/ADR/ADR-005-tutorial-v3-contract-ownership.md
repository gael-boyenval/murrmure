# ADR-005 — Tutorial v3 contract ownership and decision packet

**Status:** accepted  
**Date:** 2026-07-14  
**Scope:** Tutorial v3 build Tasks 00–12

## Context

Tutorial v3 crosses flow authoring, compilation, handlers, run projections, Views,
artifacts, local connections, filesystem execution, and agent prompts. Parallel
delivery is safe only if each shared shape has one canonical owner. The detailed
normative contracts continue to live in `studio-specs/current/`; this packet
records ownership and links delivery tasks to the decisions they implement.

The accepted clean-slate decisions are the
[coordinating plan refinement decisions](../plans/2026-07-13-tutorial-v3-full-alignment.md#refinement-decisions).
There are no compatibility aliases, dual readers, migrations, or open
architecture gates for Tasks 01–12.

## Decision

### Canonical shared-contract ownership

| # | Shared contract | Canonical package and location | Delivery owner |
|---:|---|---|---|
| 1 | Normalized flow/start contract | `@murrmure/contracts` — `src/flow/manifest.ts` | Task 03 |
| 2 | Normalized resolver-agnostic step/branch authoring contract | `@murrmure/contracts` — `src/entities/step-contract.ts` | Task 03 |
| 3 | Compiled `BranchResolveContract` and validation-error envelope | `@murrmure/contracts` — `src/entities/step-contract.ts` | Task 05 |
| 4 | Handler alias plus canonical indexed identity | `@murrmure/contracts` — `src/entities/handler.ts` | Task 04 |
| 5 | Run `open_steps[]` and sanitized resolver projection | `@murrmure/contracts` — `src/entities/run.ts` | Task 04 |
| 6 | Versioned View host/context/submission protocol | `@murrmure/view-sdk` — `src/types.ts` and `src/app/messages.ts` | Task 04; Task 05 consumes and extends only through this owner |
| 7 | Upload intent and public artifact reference | `@murrmure/contracts` — `src/entities/artifact.ts` | Task 05 |
| 8 | Neutral connection descriptor and credential-lookup result | `@murrmure/contracts` — `src/entities/connection.ts` | Task 02 |
| 9 | Local run scratch path API | `@murrmure/hub-core` — `src/run-scratch-paths.ts` | Task 11; Task 05 may establish only the API foundation |
| 10 | Versioned agent prompt protocol | `@murrmure/hub-core` — `src/flow-engine/agent-prompt-protocol.ts` | Task 07 |

Consumers import these contracts. They must not publish parallel public shapes,
merge branch contracts at step level, infer resolver bindings client-side, or
expose local credential/path implementation details through wire contracts.

### Tutorial fence and evidence contracts

- Behavior-defining fences use an immediately preceding
  `<!-- tutorial-v3-fence:<stable-id> -->` marker.
- `test-utils/spaces/tutorial-v3/fences.json` is the canonical fence-to-fixture
  registry. Missing IDs, duplicate IDs, missing targets, unregistered marked
  fences, and content drift fail docs-proof.
- YAML and JSON compare as canonical recursively key-sorted structures. Shell,
  TypeScript, TSX, and executable text compare byte-for-byte after normalizing
  the Markdown fence's single trailing newline.
- Progressive snapshots are Parts 2, 3, 5, and 6. Each snapshot extends the
  preceding stage and can be materialized as an isolated space.
- Skeleton tests are skipped with their owning build-task ID. Expected failures
  are forbidden.
- Manual acceptance records conform to
  `test-utils/spaces/tutorial-v3/manual-acceptance.schema.json` and contain task,
  chapters, environment, product build, commands, run IDs, evidence, result,
  and blockers.

## Task-to-decision index

The anchors below are the owning decision records for Tasks 01–12. The task
files and `studio-specs/current/` remain the detailed implementation and
normative sources; this packet intentionally does not duplicate those contracts.

| Build task | Owning decision |
|---:|---|
| 01 | [Clean first boot and explicit fixtures](#task-01-clean-first-boot-and-explicit-fixtures) |
| 02 | [Connection identity, credential boundary, and launcher](#task-02-connection-identity-credential-boundary-and-launcher) |
| 03 | [Trigger-only resolver-agnostic flow contract](#task-03-trigger-only-resolver-agnostic-flow-contract) |
| 04 | [Space-owned View resolver and hardened host](#task-04-space-owned-view-resolver-and-hardened-host) |
| 05 | [Branch resolve and host-mediated upload](#task-05-branch-resolve-and-host-mediated-upload) |
| 06 | [Safe shell execution and assignment lifecycle](#task-06-safe-shell-execution-and-assignment-lifecycle) |
| 07 | [Versioned agent assignment protocol](#task-07-versioned-agent-assignment-protocol) |
| 08 | [Nested call, return, yield, and resume](#task-08-nested-call-return-yield-and-resume) |
| 09 | [Flow admission and apply quiescence](#task-09-flow-admission-and-apply-quiescence) |
| 10 | [Tutorial-owned repository policy](#task-10-tutorial-owned-repository-policy) |
| 11 | [Local run storage and federation boundary](#task-11-local-run-storage-and-federation-boundary) |
| 12 | [Server-owned graph projection and pinned history](#task-12-server-owned-graph-projection-and-pinned-history) |

### Task 01 — Clean first boot and explicit fixtures

Fresh boot has no operational bootstrap contract, seeded space, demo flow, or
FDK compatibility path. Tests install fixtures explicitly.

### Task 02 — Connection identity, credential boundary, and launcher

One connection represents one machine/trust boundary. Descriptors contain IDs,
never tokens; local lookup uses the OS credential store and fails closed.

### Task 03 — Trigger-only resolver-agnostic flow contract

`triggers` is the sole start contract. Steps have no role/presentation modality;
omitted branches normalize to canonical `completed`/`failed`, and open runtime
state is generic.

### Task 04 — Space-owned View resolver and hardened host

Spaces bind Views through handlers. The server projects the resolver and branch
context; a sandboxed host owns mutation authority and the iframe has none.

### Task 05 — Branch resolve and host-mediated upload

Each branch owns one compiled resolve contract. Uploads require a bound intent,
trusted validation, bounded resources, atomic consume, and sanitized errors.

### Task 06 — Safe shell execution and assignment lifecycle

Dynamic values occupy complete arguments and are quoted once by the runtime.
Assignments receive ephemeral authority and process-group termination.

### Task 07 — Versioned agent assignment protocol

Assignments begin `Protocol: murrmure.agent/v1` and render live, deterministic,
branch-neutral calls from the canonical compiled contract.

### Task 08 — Nested call, return, yield, and resume

Children return through protocol resume events. Parents remain open; scoped
child activation cannot mutate arbitrary steps.

### Task 09 — Flow admission and apply quiescence

Spaces own per-flow admission. Apply and run start share one space guard, no
queue/force/hot-swap path exists, and admitted runs pin their configuration.

### Task 10 — Tutorial-owned repository policy

Dirty-worktree checks, archive naming, and staging allowlists are tutorial-space
behavior, not a Hub Git contract. No additional architectural ADR is required.

### Task 11 — Local run storage and federation boundary

`.mrmr/dev/runs/{run_id}` is the sole local scratch root. Public and federated
contracts carry references, not host paths; lifecycle and retention are explicit.

### Task 12 — Server-owned graph projection and pinned history

The server projects authorization-safe graph data from canonical contracts.
Current views follow latest applied identity; runs and history pin their digest.

## Consequences

- Build Tasks 01–12 consume accepted decisions instead of reopening Phase 0.
- A package may implement adapters around a canonical contract but may not own a
  second public definition.
- Focused plans remain research/detail references. The ordered Tutorial v3
  backlog owns delivery scope, dependencies, path leases, and done gates.
- Product behavior still requires same-slice updates to normative specs, docs,
  skills, examples, enforcement, and operator changelogs.

