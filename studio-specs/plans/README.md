# Plans — active implementation specs

> **On conflict, [current/](../current/) wins for shipped behavior.**

## Active

| Plan | Goal |
|------|------|
| [2026-07-13-tutorial-v3-full-alignment.md](./2026-07-13-tutorial-v3-full-alignment.md) | **Coordinating delivery plan** — make Tutorial 1 v3 true end to end across code, security, tests, specs, docs, skills, scaffolds, and packaged Desktop; defines parallel workstreams, path ownership, merge waves, and full-completion gates |
| [2026-07-14-tutorial-v3-build-tasks/](./2026-07-14-tutorial-v3-build-tasks/) | **Ordered implementation backlog** — 15 dependency-ordered, mostly vertical tasks with user stories, contracts, automated/manual tutorial testing, docs/skills/spec surfaces, ADR gates, and done criteria |
| [2026-07-10-hub-clean-slate-boot.md](./2026-07-10-hub-clean-slate-boot.md) | Hub and Desktop start with **no seed contracts**; remove `PACKAGE_CATALOG` and FDK stubs; move `linear-demo-v2` to `test-utils/`; audit hardcoded production stub data |
| [2026-07-10-desktop-mcp-bridge-exposure.md](./2026-07-10-desktop-mcp-bridge-exposure.md) | Verify bundled MCP bridge is exposed via `shared.json` → `mcp_bridge.command`; no separate npm install when Desktop is installed |
| [2026-07-10-agent-grant-onboarding.md](./2026-07-10-agent-grant-onboarding.md) | **Participant connection onboarding** — connection create/activate CLI, least-privilege profile, credential storage, and harness-agnostic MCP/skills integration adapters |
| [2026-07-10-flow-branch-api-simplify.md](./2026-07-10-flow-branch-api-simplify.md) | **Phase 0 research** → unify branch routing; cleanly remove flow `role`/`presentation` so steps remain resolver-agnostic |
| [2026-07-10-step-default-branches.md](./2026-07-10-step-default-branches.md) | **Default `completed` / `failed`** branches from step order; remove resolver modality from authored/compiled steps |
| [2026-07-10-handler-authoring-simplify.md](./2026-07-10-handler-authoring-simplify.md) | `on: step.opened::{key}`, `view_resolver`, default `cwd`/`delivery`, and space-owned resolver binding |
| [2026-07-10-agent-prompt-protocol-simplify.md](./2026-07-10-agent-prompt-protocol-simplify.md) | Slim agent prompt protocol — Task = workflow; protocol = contracts + MCP tools; Discovery/Resolve API only when `contract_keys.length > 1` |
| [2026-07-10-branch-schema-artifact-validation.md](./2026-07-10-branch-schema-artifact-validation.md) | Branch `schema.required` + View SDK enforce **artifact uploads** as part of resolve validation (file-only intake) |
| [2026-07-10-view-sdk-contracts-and-upload.md](./2026-07-10-view-sdk-contracts-and-upload.md) | Space-owned `view_resolver`, branch contracts in View context, safe file submission, and complete removal of built-in resolver forms |
| [2026-07-10-run-scratch-path-normalize.md](./2026-07-10-run-scratch-path-normalize.md) | **One canonical path** for run step workdirs/artifacts — `.mrmr.temp/runs` vs `.mrmr/dev/runs` drift |
| [2026-07-13-shell-space-home-and-flow-viz.md](./2026-07-13-shell-space-home-and-flow-viz.md) | Shell UI: **unified Flows card** + scrollable Recent completed; flow detail = flowchart view with **Run in header**, branch/gate fan-out, **fail terminal block**, and per-step **meta** (branches/contracts/handlers) |

New work should start here only when a slice needs a tracked plan before landing in `current/`.

## Shipped (archived 2026-07-09)

All completed plans live under [`archives/plans/shipped-2026-07/`](../archives/plans/shipped-2026-07/):

| Archive folder / file | What shipped |
|-----------------------|--------------|
| `space-handlers/` | Handlers + contract keys; `.mrmr/` layout cutover; split skills; docs/spec remediation |
| `product-plan/` | Rev-5 phases 01–10 — v2 core B1–B10 |
| `mcp-reliability/` | MCP reliability Phases 0–4, 6 — `@murrmure/mcp-bridge`, hub input schemas, MCP-CUTOVER, doctor live probes, docs/skills sweep |
| `2026-07-07-step-contracts-unified-state-machine.md` | Step contracts v2.2 normative spec (VS-8) |
| `2026-07-08-step-contracts-vertical-slices.md` | VS-0–VS-8 delivery plan |
| `step-contracts-v21review-*.md` | Pre-ship review notes |
| `acceptance/` | Manual VS acceptance artifacts |
| `2026-07-07-tutorial1-unblock-discovery.md` | Feedback triage (Phases A–D) |
| `2026-07-07-tutorial1-phase-a-desktop-auth-plan.md` | Desktop view iframe auth (H2) |
| `2026-07-07-phase-a-findings.md` | Phase A.0 investigation log |

## Normative specs (not plans)

| Location | Role |
|----------|------|
| [current/product/spec.md](../current/product/spec.md) | Shipped product behavior |
| [current/product/deferred.md](../current/product/deferred.md) | Intentional non-goals |
| [archives/plans/product/](../archives/plans/product/) | Historical rev-1 drafts |

## Backlog symptoms

v2 core B1–B10: **closed** — see [known-gaps](../../apps/docs/guide/known-gaps.md).

Handlers cutover VS-0–VS-6: **closed** — see [space-handlers archive](../archives/plans/shipped-2026-07/space-handlers/README.md).

Remaining manual sign-off (Tutorial E2E, federation E2E, feedback closure) is tracked in archived orchestration logs under `space-handlers/` and `mcp-reliability/`.
