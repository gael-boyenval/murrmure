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

