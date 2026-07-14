# Tutorial v3 — ordered build tasks

**Date:** 2026-07-14  
**Status:** Ready for execution  
**Source plan:** [Tutorial 1 v3 full product alignment](../2026-07-13-tutorial-v3-full-alignment.md)  
**Acceptance path:** [Tutorial 1 v3](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/)

This directory turns the coordinating plan into implementation-sized tasks. Tasks are vertical wherever possible: each one delivers a user-observable capability through authoring contracts, runtime, clients, tests, normative specifications, documentation, skills, and the tutorial. Task 00 is the only intentionally enabling slice.

## Execution rules

1. Build in numeric order subject to the dependency column. Tasks in the same wave may run in parallel after their dependencies pass.
2. Each task should normally be one reviewable PR. If a task must be split, every child PR must leave the product coherent and the final child owns the task's complete manual acceptance path.
3. A behavior change is incomplete until its affected `studio-specs/current/`, user docs, tutorial steps, skills, scaffolds/examples, enforcement, and changelog surfaces are synchronized in the same task.
4. Run the affected Tutorial v3 path exactly as written for every task. Record chapter, environment, commands, run IDs, and result in the PR or an acceptance artifact.
5. Add or update the ADR named by a task before merging behavior that establishes a durable architectural boundary. Do not use ADRs for tutorial-only example policy.
6. Clean-slate means no compatibility aliases, dual readers/writers, migrations, deprecation windows, or stale public vocabulary.
7. The task file is the scope and done gate. The coordinating and focused plans are references; on conflict, update the task and source plan before implementation.
8. Build-task numbers are intentionally independent from the coordinating plan's T00–T15 identifiers. Use each file's **Source work packages** field when tracing coverage; never infer ownership from matching numbers.

## Build order

| Order | Task | Wave | Depends on | User-visible outcome |
|---:|---|---:|---|---|
| 00 | [Freeze contracts and build the tutorial harness](./00-contracts-and-tutorial-harness.md) | 0 | — | Contributors have executable Tutorial v3 fixtures and approved architectural records. |
| 01 | [Launch clean and create a named space](./01-clean-launch-and-space-creation.md) | 1 | 00 | A first-time user starts with an empty product and creates the tutorial space. |
| 02 | [Connect local tools through the bundled bridge](./02-connect-local-tools.md) | 2 | 01 | Setup creates one least-privilege local connection and configures selected contexts without exposing a token. |
| 03 | [Author, apply, start, and externally resolve a minimal flow](./03-minimal-flow.md) | 1 | 00 | The exact Part 2 flow applies, starts, exposes an open step, and resolves without modality fields. |
| 04 | [Bind and open the intake View](./04-intake-view.md) | 2 | 03 | A space-owned View resolver opens the exact tutorial View; unbound steps remain observable without fallback forms. |
| 05 | [Submit and validate the specification artifact](./05-spec-artifact-submission.md) | 3 | 04 | The View securely uploads or cancels a validated Markdown specification with progress and deterministic errors. |
| 06 | [Copy the specification with a safe shell handler](./06-safe-spec-copy-handler.md) | 4 | 05 | A handler consumes a verified run-scoped artifact path and copies the specification safely. |
| 07 | [Build with a connected agent](./07-connected-agent-build.md) | 5 | 02, 05, 06 | The connected agent receives a complete live contract and resolves the build step with scoped authority. |
| 08 | [Run a nested build/review loop](./08-nested-build-review-loop.md) | 6 | 07 | A parent resolver can yield to declared children, resume, iterate, and resolve its own contract. |
| 09 | [Enforce run capacity and safe apply](./09-run-capacity-and-apply-safety.md) | 5 | 03, 04 | The space serializes the tutorial flow and rejects apply while any run is active. |
| 10 | [Archive and commit only workflow-owned outputs](./10-cleanup-archive-and-commit.md) | 6 | 06, 07, 09 | The tutorial archives the submitted spec and commits only allowlisted outputs with an auditable SHA. |
| 11 | [Consume multi-file artifacts and retain run data safely](./11-multifile-artifacts-and-retention.md) | 5 | 05, 06 | Local and remote consumers receive correct collection representations, quotas, isolation, and retention. |
| 12 | [Use one truthful flow page from preview through history](./12-shared-flow-page.md) | 7 | 03, 04, 05, 07, 09 | Users inspect and run a flow on one authorization-safe static/live/historical graph. |
| 13 | [Complete the clean-slate cutover](./13-clean-slate-cutover.md) | 8 | 01–12 | Removed APIs, seed/FDK behavior, paths, UI, docs, and skills cannot return. |
| 14 | [Release through the complete tutorial](./14-release-through-tutorial.md) | 9 | 13 | Parts 1–6 pass verbatim in CI and packaged macOS acceptance with required evidence. |

## Parallel build waves

```text
00
├── 01 ──> 02 ───────────────────────┐
└── 03 ──> 04 ──> 05 ──> 06 ──> 07 ├──> 10
                 │       │       └──> 08
                 │       └──────────> 11
                 └──> 09 ───────────> 12
01–12 ───────────────────────────────> 13 ──> 14
```

Tasks 08, 10, 11, and 12 may proceed in parallel once their own dependencies are satisfied. Task 13 is an integration/removal gate, not permission to defer slice-owned cleanup or documentation.

## Required task evidence

Every completed task records:

- implementation commit/PR and task ID;
- automated test commands and results;
- Tutorial v3 chapters executed manually, environment, and result;
- normative specs, user docs, tutorial, skills, scaffolds/examples, enforcement, and changelog changed or explicitly marked unaffected;
- ADR created/updated, or the task's stated reason that no ADR is required;
- removed paths and repository guards added;
- security/authorization impact;
- any follow-up that is outside this release, with an owner and non-blocking rationale.

