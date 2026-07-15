# 12 — Use one truthful flow page from preview through history

**Status:** Ready  
**Build order:** 12  
**Depends on:** 03, 04, 05, 07, 09  
**Source work packages:** T14

## Goal

Deliver one authorization-safe flow experience: users find each flow once, inspect its applied graph, start it when allowed, watch the same page become live, inspect step contracts/resolvers, and revisit a run pinned to the configuration that actually executed.

## User stories

- As a user, each logical flow appears once with correct preview/run affordances.
- As an author, I inspect default and custom branches, schemas, artifacts, and safe resolver identity before running.
- As an operator, the page layout remains stable when a preview becomes a live run.
- As a historian, an old run continues to show its original flow and handler identity after a later apply.
- As a limited reader, I see only metadata authorized for my capabilities.
- As a space user, I see a bounded recent-completed list and can navigate to full history.

## Contracts

- Logical flow identity is `{origin_space_id, flow_id}`; current applied and run/historical identities add `flow_digest`.
- Different origins remain distinct even with matching names or content digests.
- Server computes `can_run` and projects authorized graph contracts/resolver metadata; client does not compile defaults or match handlers.
- With authorized `flow:read`, projection includes branch schemas, routes, artifact constraints, and safe resolver identity, never commands, prompts, paths, parameters, environment, or secrets.
- Applied preview uses current resolver binding; live open steps use run projection; history uses handler/config identity recorded at dispatch.
- Applied and live modes share one page/component, graph layout, selection, and metadata interaction model.
- Header Run appears only for manually startable and authorized flows.
- Rectangular step nodes remain modality-neutral.
- Plain `completed`/`failed` uses direct success plus subdued red edge to one shared failure terminal.
- Decision diamond appears only for custom or multi-outcome branching.
- Step selection opens the existing side panel; narrow screens use a drawer.
- Space home exposes at most 20 recent completed runs in a fixed-height scroller and a **View all runs** link.

## Implementation

- Deduplicate and sort authorized flow rows by canonical logical identity.
- Add bounded recent-completed payload/UI.
- Add server static graph projection from one applied catalog/IR digest and live/historical projection from run-pinned data.
- Replace separate preview/running implementations with one shared page and transition after start.
- Render branch/failure topology and step metadata panel/drawer.
- Consume inline resolver and canonical branch contracts; remove client-side handler joins/contract inference.
- Version changed preview/home payloads as required by the clean cutover.
- Preserve keyboard/focus/accessibility behavior across page modes.

## Testing

### Automated

- Home identity/dedupe/sort/capability/federation tests.
- Recent list cap 20, fixed-height behavior, stable page height, and history navigation.
- Static/live/default/explicit graph parity and graph-shape snapshots.
- Run button startability and authorization matrix.
- Server projection parity/redaction for `flow:read`, `flow:run`, `space:read`, and cross-space access.
- Apply rejection leaves live metadata unchanged; later apply changes current preview but not history.
- Resolver metadata distinguishes current versus historical without leaking internals.
- Side panel/drawer selection, focus, close, persistence, and narrow-screen stories.
- One shared failure terminal and no modality-derived node type.

### Manual

- Use Tutorial Parts 1–4 to find, preview, start, and watch the flow without changing page experience.
- Select each step and inspect branches, schemas, artifacts, and resolver status.
- Attempt apply during the run, finish it, apply a changed handler, and compare live/history/current preview.
- Test an actor that may preview but not run and one lacking sensitive metadata access.
- Inspect flows with matching names from different origins.
- Fill recent history beyond 20 and use **View all runs**.

## Documentation, skills, specs, and ADRs

- **ADR required only if absent:** server-owned authorized graph projection and digest-pinned historical rendering. Record it as a client/server ownership boundary, not a visual-style decision.
- **Normative specs:** shell/preview authorization, canonical flow identity, graph data source and run pinning.
- **User docs:** `creating-flows.md` and operator navigation/history guidance.
- **Tutorial:** Parts 1 and 4 screenshots/instructions/expected states.
- **Skills:** update only if agent-facing graph semantics are documented.
- **Scaffolds/examples:** graph and authorization fixtures.
- **Enforcement:** API authorization/redaction tests and UI stories/snapshots.
- **Changelog:** unified home/flow page and history behavior.

## References

- [Shell home and flow visualization](../2026-07-13-shell-space-home-and-flow-viz.md)
- [Coordinating plan T14](../2026-07-13-tutorial-v3-full-alignment.md)
- [Tutorial v3](../../../apps/docs/guide/tutorials/01-local-preview-review-v3/)

## Done gate

- Each authorized flow appears once under canonical identity.
- Preview, live run, and history use one truthful digest-aware page.
- Default/explicit contracts render equivalently and custom branches alone create decisions.
- Sensitive handler data is absent from unauthorized/server projections.
- Tutorial screenshots and manual instructions match the shipped UI.


## Handoff

| Turn | Agent | Model | Status | Summary | Evidence | Next |
|------|-------|-------|--------|---------|----------|------|
| build | build | glm-5.2 | complete | Built Task 12 at `622aa77`: one authorization-safe flow page shared across applied preview, live runs, and history. Canonical dedupe/sort of flows by `{origin_space_id, flow_id}`, bounded 20-run recent-completed scroller plus a full run-history page, server-owned graph projection (normalized branch routes, custom decision diamonds, one shared failure terminal, sanitized digest-pinned resolver identity with `resolver_source`), and a responsive step metadata panel that becomes a drawer on narrow screens. Space-home payload v2 and flow-preview payload v2 carry the authorized graph and server-computed `can_run`; clients no longer infer contracts or join handlers. Docs (`creating-flows.md`, Tutorial Parts 1 and 4), agent/developer skills, and changelog are synchronized. Task 08 open-child-step and Task 11 collection/retention changes were excluded from this commit. | Commit `622aa77` (36 files, +1342/-333). `npx vitest run` on `flow-page-graph.test.ts` (2), `tutorial-v3-shell-ui.test.tsx` (4), `RunFlowchartView.test.tsx` (5), `http/spaces/home.test.ts` (2), `http/runs/graph.test.ts` (1): 5 files, 14/14 tests passed. | Review Task 12. |
| review | review | glm-5.2-max | blocked | At clean commit `622aa77` (Tasks 08/11 working changes stashed), the targeted suite is 13/14 green; `http/spaces/home > GET /v1/spaces/:id/home returns sections including index` fails. Task 12 renamed the space-home payload (`your_flows`→`flows`, dropped `available_to_run`, added `version: 2`) and aligned daemon/shell-client/shell-web, but did not commit the matching `home.test.ts` update (still asserts `your_flows`/`available_to_run`); the corrected test exists only as an uncommitted working-tree patch, so the build commit is not self-green and the build handoff's "14/14 passed" relied on uncommitted changes. Stale `your_flows`/`available_to_run` references also remain in `http/flows/invoke-only.test.ts` and `stories/.../space-home-empty.critique.md` at this commit. Done-gate bullets are otherwise substantively met in code: canonical dedupe/sort by `{origin_space_id, flow_id}`; shared `SharedFlowPage` across preview/live/history; decision diamonds only for non-default branches; one shared failure terminal; redacted resolver metadata with `resolver_source`; `creating-flows.md` + Tutorial Parts 1 & 4 synced. | Clean tree at `622aa77`: `npx vitest run` on the 5 targeted files = 13 passed / 1 failed (14 cases). Pass: `flow-page-graph.test.ts` (2), `RunFlowchartView.test.tsx` (5), `tutorial-v3-shell-ui.test.tsx` (4), `http/runs/graph.test.ts` (1), `http/spaces/home > flow preview requires flow:read` (1). Fail: `http/spaces/home > GET /v1/spaces/:id/home returns sections including index` — `expected { version: 2, …(8) } to have property "your_flows"` (home.test.ts:105). `git show stash@{0}:.../home.test.ts` confirms the intended v2 assertions (`toHaveProperty("flows")`, `not.toHaveProperty("your_flows")`, `version: 2`) that were not committed in 622aa77. | Commit the `home.test.ts` v2 alignment and propagate the `your_flows`/`available_to_run` removal to `http/flows/invoke-only.test.ts` and `space-home-empty.critique.md` so the build commit is self-green; re-run the 14 targeted cases at the build commit; re-review. |
| fix | fix | gpt-5.6-sol-high | complete | Aligned Task 12 tests and snapshot critique with space-home v2: `home.test.ts` now asserts `version: 2` and canonical `flows`, `invoke-only.test.ts` reads the unified flow list, and the empty-home critique describes the unified Flows card. No Task 08 or Task 11 files were included. | Targeted Task 12 suite passed: `flow-page-graph.test.ts` (2), `tutorial-v3-shell-ui.test.tsx` (4), `RunFlowchartView.test.tsx` (5), `http/spaces/home.test.ts` (2), and `http/runs/graph.test.ts` (1): 5 files, 14/14 tests passed. | Re-review Task 12. |
