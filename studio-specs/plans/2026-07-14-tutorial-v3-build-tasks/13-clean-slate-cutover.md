# 13 — Complete the clean-slate cutover

**Status:** Ready after Tasks 01–12  
**Build order:** 13  
**Depends on:** 01–12  
**Source work packages:** removal/integration subset of T15

## Goal

Prove that the new vertical capabilities form one coherent clean product and that every superseded public shape, runtime path, fixture, current spec, user doc, skill, scaffold, and operator message has been removed or replaced.

This is a verification/removal gate. Earlier tasks must remove their own legacy paths; this task catches cross-surface leftovers and must not become a deferred implementation bucket.

## User stories

- As a new user, I encounter one vocabulary and one behavior across tutorial, CLI, Desktop, APIs, and skills.
- As a maintainer, CI prevents removed concepts from returning.
- As an operator, I receive one clear local reset procedure and no hidden compatibility mode.
- As a reviewer, current normative specs describe exactly what the clean code implements.

## Contracts

- No compatibility code, aliases, adapters, dual reads/writes, migrations, or deprecation windows.
- Strict schemas reject removed authoring fields with normal unknown-field/invalid-union errors.
- Remove and guard at least:
  - flow `start`, `requires_view`, step `role`/`presentation`, wait shapes, nullable/old routing, parent completion/goto vocabulary;
  - lifecycle-only handler dispatch, authored `kill_on`, `HANDLER_MISSING`, role-based matching;
  - direct/base64 View mutation, View-held tokens, old postMessage/API/SDK exports, built-in resolver forms;
  - old grant/agent/onboard commands, token exports, embedded-token config, legacy `action:invoke` / `gate:resolve` capabilities and tool paths;
  - seed/package-catalog/FDK production/current guidance;
  - `.mrmr.temp/runs` and public local paths;
  - stale checkpoint/gate/human-step lifecycle and separate preview/running UI payloads.
- Historical archives may retain rationale only with explicit superseded/non-normative marking and exclusion from active guidance enforcement.
- `studio-specs/current/` wins and must be synchronized before plans are archived.

## Implementation

- Build a repository-wide absence/rejection matrix from every removal list in Tasks 01–12.
- Delete remaining code, schemas, types, commands, routes, components, fixtures, snapshots, examples, templates, and docs.
- Rename stale diagnostics where the clean protocol changed; keep no aliases.
- Explicitly remove or rename `CHECKPOINT_*` diagnostics and guard against checkpoint-era vocabulary in active surfaces.
- Sweep current specs, bridges, tutorials, references, skills, scaffolds, and changelog for contradictions.
- Add repository guards scoped to active surfaces while permitting marked archives.
- Update focused plan statuses and archive only when their behavior and acceptance are represented by completed tasks/current specs.
- Ensure package manifests/workspace files no longer include deleted production/test assets.

## Testing

### Automated

- Full unit/integration/E2E/typecheck/lint/build/package suite.
- Strict rejection tests for every removed schema/command/API shape.
- Repository absence guards across active code, specs, docs, skills, examples, and scaffolds.
- Docs-proof for all Tutorial v3 pages and affected references/skills.
- Package-content inspection for removed seeds, forms, stale bridge paths, and deleted assets.
- Tutorial fixture runs without test-only product bypasses.

### Manual

- Search CLI/Desktop help and UI for removed vocabulary and controls.
- Follow affected tutorial steps and cross-linked references as a first-time user.
- Exercise one invalid legacy example per major surface and verify immediate clear rejection.
- Perform the one-time local reset and confirm only clean behavior remains.
- Review current specs against observed API/UI behavior.

## Documentation, skills, specs, and ADRs

- **ADRs:** mark superseded ADRs explicitly and add supersession links from replacement ADRs. Create no new architecture in this cleanup task.
- **Normative specs:** complete sweep of `studio-specs/current/`, including product, CLI, Desktop, shell, handlers, step contract, artifacts, connections/grants, security, and acceptance.
- **User docs:** Tutorial v3, quick start, creating flows, handlers, agents MCP, View SDK, troubleshooting, and known gaps.
- **Skills:** agent and developer flow/handler/View/connection guidance.
- **Scaffolds/examples:** all generated flow, View, handler, and connection outputs.
- **Enforcement:** docs-proof, strict lint, forbidden-pattern matrix, package inspection.
- **Changelog:** complete clean-cutover removal and local reset notes.
- **Plans:** update active index and archive shipped focused plans only after current specs land.

## References

- [Coordinating plan T15](../2026-07-13-tutorial-v3-full-alignment.md)
- [Murrmure documentation sync rule](../../../.cursor/rules/murrmure-doc-sync.mdc)
- [Plans index](../README.md)
- [Current specs index](../../current/index.md)

## Done gate

- Every removed concept is absent from active repository surfaces and rejected at boundaries where user input can still contain it.
- Full tests, docs-proof, package inspection, and Tutorial v3 fixture pass.
- No normative/tutorial/code/skill/scaffold drift remains.
- Current specs and replacement ADRs are authoritative; old rationale is clearly archived.
- Remaining feature bugs return to their owning task rather than being patched opaquely here.

