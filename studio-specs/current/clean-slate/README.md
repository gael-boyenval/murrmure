# Clean-slate removal matrix

**Normative manifest:** [`removal-manifest.json`](./removal-manifest.json)

Single source of truth for vocabulary, routes, and scaffolds removed during the Tutorial v3 clean cutover (Tasks 00–15).

## Run the matrix

```bash
# Full inventory — prints blocking + informational hits; exit 1 if blocking
pnpm check:removal-matrix

# Report only — always exit 0 (use before a remediation slice)
pnpm check:removal-matrix:report

# JSON summary — top rules, surfaces, full hit list
pnpm check:removal-matrix:json
```

Also runs as part of `pnpm check:docs-proof` once the backlog is cleared (see [removal-matrix-backlog.md](./removal-matrix-backlog.md)).

## Manifest structure

| Section | Purpose |
|---------|---------|
| `task_sources` | Maps task IDs 00–15 to removal themes |
| `rule_path_suppressions` | Per-rule file allowlist (e.g. skill-agent removed-tools lists, CHANGELOG) |
| `path_allowlists` | Global path suppressions: archives, tests, fixtures |
| `surfaces` | Scan roots: `production`, `active_guidance`, `scaffolds`, `flow_manifests`, `shell_ui` |
| `rules` | Pattern + surfaces + optional `sources` (task IDs) + optional `paths_only` |

## How it differs from `check-clean-state`

| | `check-clean-state` | `check-removal-matrix` |
|---|---|---|
| Source | Hard-coded patterns in script | `removal-manifest.json` |
| Scope | Subset of roots | Production + guidance + scaffolds + flow manifests + shell UI |
| Allowlist | Same-line `allowIf` removal context | **Path-only** (archives, tests, fixtures, rule suppressions) |
| Output | Pass/fail only | Classified backlog + top rules by task |
| Links | No | Broken relative links in `apps/docs/guide` |

## Workflow

1. **Inventory** — `pnpm check:removal-matrix:report` → read full hit list.
2. **Remediate** — one PR from the backlog (code → docs → scaffolds).
3. **Verify** — `pnpm check:removal-matrix` green → single review against manifest.

Update the manifest when a new surface is removed; do not add one-off patterns only to `check-clean-state`.

When mining a completed task for new rules, add `sources: ["NN"]` on the rule and a line in `task_sources`.
