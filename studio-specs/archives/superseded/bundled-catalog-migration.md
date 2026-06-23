# Migration from bundled catalog

**Status:** normative supersession (2026-06-20)  
**Supersedes for new work:** CS-ADR-03 bundled catalog, config spec §Bundled catalog v0, setup wizard step 3 bundled install

---

## Decision

**Local-first CDK replaces bundled capability catalog.** Capabilities are user-authored and pushed via bundle digest — not selected from a platform SPA list.

| Old model | New model |
|-----------|-----------|
| `packages/studio-config-catalog/bundled.json` | Removed |
| Configure install wizard picks `review-loop` | Configure → New capability → CDK instructions + push |
| P5 manifest in `packages/review-core/` | SDK template `templates/examples/review-loop/` |
| Shell imports `@studio/review-ui` | User bundle via iframe host |

---

## Reference capabilities

`review-*`, `feature-spec-*` in platform repo:

1. Extract to `@studio/capability-sdk/templates/examples/`
2. Or separate `studio-examples` repo
3. **Not** linked from `@studio/shell-web`

First-week onboarding:

```bash
npm i -D @studio/capability-sdk
studio capability init review-loop --from-example review-loop --dir ./workflows/review-loop
studio capability build && studio capability push --space spc_ui_sandbox
```

Setup wizard step 3 becomes: **Link your workflow project** (path register + push) or skip.

---

## Install API v1 → v2

| v1 (deprecated) | v2 |
|-----------------|-----|
| `{ package_id, version, config, target_state: "live" }` | `{ package_id, version, bundle: { mode, … }, target_state: "draft" }` |
| Implicit platform bundle | User bundle digest |

Hub may accept v1 during migration with deprecation header `Sunset: …`.

---

## Configure UI changes

| Screen | Change |
|--------|--------|
| `/capabilities/install` | Replace catalog picker with CDK onboarding (BC2a) |
| `/capabilities/new` | Static: npm install, init, build, push |
| Install detail | Show `source_path`, `bundle_digest`, evolution pipeline |

---

## ADR cross-reference

When editing `research/studio/config-shell/adr/CS-ADR-03-bundled-catalog-v0.md`, add header:

> **Superseded by:** [build-capability/12-migration-from-bundled-catalog.md](../../studio-v2/build-capability/12-migration-from-bundled-catalog.md) for local-first CDK.

---

## Related

- [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md)
- [../config/spec.md](../config/spec.md) (updated install + wizard)
