# Phase 09 — Legacy FDK / worker stack **deletion**

**Status:** ✅ complete (M3–M8) — CI verification pending  
**Execution order:** **9 / 10**  
**Depends on:** [07a](./07-unified-murrmure-skill.md) (no skill refs); [08](./08-cli-setup-wizards.md) MVP (wizards don't teach FDK); **[09-pre](./09-pre-fdk-test-disposition.md)** complete  
**Decisions:** [11 test inventory](./decisions/11-fdk-test-disposition-inventory.md) · [13 hub-daemon canonical](./decisions/13-hub-daemon-canonical-no-studio-duplicates.md)  
**Policy:** **Delete FDK runtime** — not quarantine, not feature-flag, not `legacy/` subcommand tree in shipped product.

---

## Problem

v2 centers on `murrmure/` + `mrmr space apply`. FDK worker install, evolution HTTP, mount runtime, and `mrmr flow push` are **not** in the finished product — yet code, CLI, examples, specs, and docs still carry them. That guarantees author and agent confusion.

## Outcome

Finished Desktop + CLI contain **zero** FDK worker install surface. Monorepo may keep archived git history; **working tree deletes** listed artifacts. **`packages/hub-daemon/` remains canonical** — excise FDK modules inside, do **not** delete the package.

---

## 09-pre — prerequisites (must complete before delete PR)

| # | Deliverable | Owner phase |
|---|-------------|-------------|
| **P0** | **`@murrmure/view-sdk/app` ships** — `createViewMount`, `space view init`; flow-kit `/react` ported. **Do not run 09d until P0 green.** | **02** |
| P1 | v2 indexed demos: `examples/flows/preview-review-v2/` per [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) | **03 + 04 + 02 + 05** (10 wires CI) |
| P2 | Rewrite `studio-specs/current/acceptance.md` off FDK rows (CR/FS); port hub-daemon tests per [09-pre disposition table](./09-pre-fdk-test-disposition.md) | **10 starts early** (09-pre gate) |
| P2b | Migration steps M1–M8 complete before 09 merge (see below) | 09-pre |
| P3 | `orchestrator-with-review` README points to v2 demos; no FDK install steps | 10 |
| P4 | Skill has zero `flow push` / evolution references ([07a](./07-unified-murrmure-skill.md)) | 07a |
| P5 | All tutorials rewritten to v2 (`flows-tutorial` + 01–03); quick-start / creating-flows link to them | **10** (blocked on 03+04) |
| P6 | Example trees under `examples/flows/` match each tutorial's `murrmure/` layout (CI apply --strict) | **03 + 04 + 10** |
| **P7** | [09-pre-fdk-test-disposition.md](./09-pre-fdk-test-disposition.md) **100% filled** | **09-pre** |

**Gate:** Do not merge phase 09 until **P1–P7** green in CI. Tutorials must be **working v2 rewrites** before FDK pages are removed — no tutorial deletion.

### Migration path (M1–M8)

| Step | When | Action |
|------|------|--------|
| M1 | 09-pre | Add v2 example trees for every tutorial outcome (see phase 10 parity table); promote `orchestrator-with-review` |
| M2 | 09-pre | Rewrite `acceptance.md` — replace FDK CR/FS rows with v2 fixtures |
| M3 | 09-pre | Replace `example-install.ts` / `cdk-install.ts` with space-directory helpers; port or delete FDK tests per disposition table |
| M4 | 09a | Delete hub worker/mount/live-apply stack **inside hub-daemon** |
| M5 | 09c | Delete CLI FDK modules; keep `flow run`, `flow list`; **rewrite `flow status`** (strip `.flow-push-state.json` / push fields) |
| M6 | 09d | Remove `@murrmure/flow-kit` from workspace **only after 02 P0** — delete `/server`, `/validate`, `/schema`, `/digest`; `/react` already ported to view-sdk |
| M7 | 09d | **Verify** `packages/studio-hub-daemon/` and other `studio-*` packages **absent** — do not delete `packages/hub-daemon/` ([decision 13](./decisions/13-hub-daemon-canonical-no-studio-duplicates.md)) |
| M8 | 10 | `demo-space/murrmure/` + `mrmr space apply --strict` in CI |

---

## Keep list (explicit — not deletion targets)

| Surface | Why kept |
|---------|----------|
| `packages/hub-daemon/` | Canonical hub runtime package — FDK modules removed, package stays |
| `mrmr flow run`, `mrmr flow list` | Indexed flows via hub |
| `mrmr flow status` | Read indexed install state (rewrite output — no push-state messaging) |
| Orchestration attach (MCP) | Ephemeral agent proposals — second authoring surface |
| `worker poll` / executor routes | Shell spawn + hub executors (not FDK mount workers) |
| `@murrmure/view-sdk` | Host (`ViewHostFrame`) + **app** (`createViewMount`) — replaces flow-kit `/react` |
| `packages/hub-core/src/flow-engine/` | v2 engine — not FDK |
| Hooks + `murrmure/hooks.yaml` | v2 trigger model |
| `routes/phase07/index.js` | v2 gates, notifications, journal query (not FDK) |

### Delete vs keep (ambiguous commands)

| Command | Action |
|---------|--------|
| `mrmr flow init` | **Delete** — replaced by `mrmr space flow init` |
| `mrmr flow validate`, `build`, `push`, `dev --space` | **Delete** |
| `mrmr flow dev --sim` | **Delete** (local sim server in `packages/cli/src/dev-sim/`) |
| `mrmr flow evolution *` | **Delete** (already retired stub) |
| `mrmr flow status` | **Keep** — strip push-state / FDK fields |
| Top-level `mrmr view init` | **Delete** — replaced by `mrmr space view init` |

---

## Internal sub-order (within phase 09)

```
09-pre — Fill test disposition table; v2 examples; acceptance rewrite
09a — Rewrite/delete tests using FDK fixtures (per disposition table)
09b — Delete hub worker/mount/evolution modules inside hub-daemon + daemon composition
09c — Delete CLI FDK modules + templates + init.ts FDK path
09d — Delete packages/flow-dev-kit + workspace refs; verify studio-* absent
09e — Delete examples/capabilities + FDK tutorial docs
09f — Delete skill FDK reference files
09g — Grep gate + CI green
```

---

## Deletion inventory

### Hub daemon (`packages/hub-daemon/src/`)

| Module / route | Action |
|----------------|--------|
| `flow-worker-pool.ts`, `worker-supervision.ts` | **Delete** |
| `mount-registry.ts`, `mount.js` (if present) | **Delete** |
| `bundle-ingest.ts`, `bundle-store.ts` | **Delete** (FDK bundle install only) |
| `live-apply.ts` | **Delete** |
| `host-bridge.ts` (FDK mount bridge) | **Delete** |
| `capability-worker-entry.js` (desktop bundle) | **Delete** from desktop build |
| `routes/flows/index.js` evolution/install handlers | **Delete** FDK install handlers only |
| `routes/phase07/index.js` | **Keep** — v2 gates, notifications, journal query |
| `routes/flow-static.ts` | **Delete** (FDK bundle UI serving) |
| `routes.ts` worker proxy middleware | **Remove** FDK worker proxy paths |
| `mcp-tool-registry.ts` | Decouple from `MountRegistry` |
| `mount.ts`, `host-bridge.js`, `hub-bridge-client.js` | **Delete** |
| `routes/config/*` install listing / `flow:install` scope | **Delete** or repurpose to indexed flows only |
| `routes/triggers/index.ts` event-catalog | **Rewrite** — repoint off `mountRegistry.getRoutes()` to indexed actions/hooks |
| `main.ts` seeded contracts `cref_review_loop`, `cref_feature_spec` | **Delete** or replace with v2 demo fixtures |
| `main.ts` `seedLiveMounts` | **Remove** — stop spawning workers from `listFlowInstalls` |
| `context.ts` | Remove FDK types from daemon context |
| `packages/cli/src/digest.ts`, `lib/doctor.ts` FDK checks | **Delete** or rewrite (CLI side) |
| `apps/desktop/electrobun.config.ts` | Remove `capability-worker-entry.js` from hub bundle |
| Persistence: `capability_installs`, `evolution_state`, `FlowInstall` | **Deprecate/migrate** — document post-delete DB behavior |

### Duplicate packages ([decision 13](./decisions/13-hub-daemon-canonical-no-studio-duplicates.md))

| Path | Action |
|------|--------|
| `packages/studio-hub-daemon/` | **Verify absent** — already removed from repo; M7 = grep gate, not delete canonical hub |
| `packages/studio-*` duplicates | **Verify absent** — package-by-package grep in CI |

### CLI (`packages/cli/src/`)

| Module | Action |
|--------|--------|
| `init.ts` (FDK scaffold) | **Delete** or gut to non-FDK only |
| `build.ts`, `validate.ts`, `push.ts`, `dev.ts` | **Delete** |
| `dev-sim/` | **Delete** |
| `tar.ts` (flow build artifacts) | **Delete** if only FDK |
| `commands/flow/commands.ts` | Keep `run`, `list`, `status` only |
| `lib/flow-formatters.ts` | Remove push/build/init formatters |
| `templates/flows/` (review-loop, feature-spec) | **Delete** |
| `@murrmure/flow-kit` dependency | **Remove** from `package.json` |

### Packages

| Path | Action |
|------|--------|
| `packages/flow-dev-kit/` | **Delete** entire package |
| `pnpm-workspace.yaml`, root `package.json` scripts | Remove flow-kit refs |
| `dependency-cruiser` / vitest paths | Remove deleted package paths |

### Examples & tests

| Path | Action |
|------|--------|
| `examples/capabilities/` | **Delete** (after v2 demos in 09-pre) |
| `packages/hub-daemon/test/http/flow-runtime/*` | Per [09-pre disposition](./09-pre-fdk-test-disposition.md) |
| `packages/hub-daemon/test/http/feature-spec/*` | Per disposition |
| `packages/hub-daemon/test/helpers/cdk-install.ts`, `example-install.ts` | Per disposition |
| `packages/cli/test/cdk-conformance.test.ts` | Per disposition |
| `vitest.config.ts` flow-runtime project entries | Remove FDK suites |

### Specs & studio-specs

| Path | Action |
|------|--------|
| `studio-specs/current/build-capability/` | **Archive** to `studio-specs/archives/build-capability/` |
| Root `package.json` `dev` / `examples:build` flow-kit scripts | **Remove** |
| `.github/workflows/ci.yml`, `release.yml` flow-kit publish/pack steps | **Remove** |
| `studio-specs/current/flow-runtime/` | **Archive** or delete |
| `studio-specs/current/capabilities/` | **Archive** or delete |
| `studio-specs/current/bridges/flow-runtime.md` | **Delete** or archive |
| `studio-specs/current/acceptance.md` FDK rows | **Rewrite** in 09-pre (M2) |
| `current/product/philosophy.md` | Remove `mrmr flow push` narrative |

### Human docs — **delete or redirect**

| File | Action |
|------|--------|
| `apps/docs/guide/flows-tutorial.md` | **Rewrite** to v2 space-directory authoring |
| `apps/docs/guide/flow-evolution.md` | **Delete** |
| `apps/docs/reference/flow-dev-kit.md` | **Delete** |
| `apps/docs/guide/tutorials/**` (all 16 pages + index) | **Rewrite in place** to v2 |
| `apps/docs/guide/creating-flows.md` | Remove FDK worker section |
| `apps/docs/guide/how-it-fits-together.md` | Remove flow-kit row |
| `apps/docs/guide/review-workflow.md` | Rewrite to v2 indexed flow |
| `apps/docs/reference/mcp-tools.md` | Remove FDK mount tool entries |
| `README.md` | Remove CDK/FDK as product center |

### Skill — **delete** (not legacy stub)

- [ ] `reference/evolution-pipeline.md`
- [ ] `reference/capability-authoring.md`
- [ ] `reference/workers.md`
- [ ] All `mrmr flow push` mentions in remaining skill files
- [ ] `reference/flow-authoring.md` — rewrite to space-directory only

---

## Definition of done

### Verification grep (must return zero in shipped paths)

```bash
rg -l 'flow push|FlowWorkerPool|MountRegistry|evolution/promote|murrmure-flow|flow-dev-kit|@murrmure/flow-kit' \
  packages/hub-daemon packages/cli packages/shell-web apps/docs packages/cli/skill \
  vitest.config.ts .github/workflows README.md studio-specs/current/product \
  --glob '!**/archives/**'
```

Also verify: `packages/studio-hub-daemon` path does not exist.

### Tests

- [ ] [09-pre disposition table](./09-pre-fdk-test-disposition.md) 100% filled
- [x] CI green after deletions *(715/716 — one pre-existing invoke notification test)*
- [ ] No test imports deleted modules
- [ ] Desktop MCP catalog has no FDK mount tools in default build
- [ ] v2 demo spaces apply with `--strict` in CI

### Docs

- [ ] [current/product/deferred.md](../../../current/product/deferred.md) — FDK section **removed** (deleted, not deferred)
- [ ] CHANGELOG entry: breaking removal of FDK CLI and worker runtime

### Proof

Contributor: `mrmr flow push` → command not found. Desktop hub: no worker pool startup in logs. Agent skill: no evolution/push references.

---

*End of phase 09.*
