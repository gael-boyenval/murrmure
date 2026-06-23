# Conformance fixtures matrix

**Status:** normative index (2026-06-21)  
**Fixtures root:** `../fixtures/build-capability/` (to be implemented)

---

## Matrix

| Fixture | CDK acceptance | Runtime | Config | Cloud | Journeys |
|---------|----------------|---------|--------|-------|----------|
| `local-init-scaffold.json` | BC-min #1 | — | — | — | J14 |
| `strict-react-init-scaffold.json` | BC-min #2 | — | — | — | J14 |
| `exact-semver-policy.json` | BC-min #2 | — | — | — | J14 |
| `push-draft-install.json` | BC-min #5 | CR0 | CS install v2 | — | J14 |
| `push-state-recovery.json` | UX-02 | — | — | — | — |
| `live-apply-user-ui.json` | BC-min #6–7 | CR0 apply | — | — | J01 |
| `iframe-canvas-host.json` | BC3 | — | — | — | J01 |
| `worker-server-mount.json` | BC4 | CR0 | — | — | — |
| `mcp-user-tool-invoke.json` | BC-min #8 | CR1 catalog | — | — | J01 |
| `mcp-tool-collision.json` | BC-full #11 | CR1 | — | — | — |
| `rollback-user-bundle.json` | BC-full #15 | CR0 CR9 | — | — | J11 |
| `install-policy-violation.json` | BC-full #13 | CR0 | deny-install-prod | — | J16 |
| `bundle-digest-mismatch.json` | ARCH-04 | — | — | — | — |
| `local-path-denied.json` | ARCH-04 | — | — | — | — |
| `ci-push-live.json` | — | CR0 | — | CL1 | J15 |
| `dev-reload-sse.json` | BC-full #16 | CR2 | — | — | J13 |
| `dev-sim-runtime.json` | BC-full #17 | CR2 | — | — | J13 |
| `playwright-sim-e2e.json` | BC-full #18 | CR2 | — | — | J13 |

---

## Cross-links to existing fixtures

| Existing | Relationship |
|----------|--------------|
| `fixtures/config/first-week-setup.json` | **Replace** step 3 with CDK push flow |
| `fixtures/capability-runtime/promote-tool-refresh.json` | Add `bundle_digest` + user manifest tools |
| `fixtures/config/deny-install-prod.json` | Unchanged policy semantics |

---

## Green criteria (CDK program)

| Tier | Required fixtures |
|------|-------------------|
| CDK-min | local-init, strict-react-init, exact-semver-policy, push-draft, live-apply-user-ui, mcp-user-tool-invoke |
| CDK-standard | + worker-server-mount, iframe-canvas-host, rollback-user-bundle |
| CDK-dev | + dev-reload-sse, dev-sim-runtime, playwright-sim-e2e, push-state-recovery |

---

## Related

- [acceptance.md](./acceptance.md)
- [12-worker-runtime-and-host-bridge.md](./12-worker-runtime-and-host-bridge.md)
- [archives/reviews/build-capability-REVIEW-2026-06-20.md](../../archives/reviews/build-capability-REVIEW-2026-06-20.md)
