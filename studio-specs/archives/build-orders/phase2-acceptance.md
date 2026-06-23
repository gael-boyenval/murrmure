# Acceptance — phase 2 fixtures + journeys

Each fixture must pass **and** link to a walkthrough in [journey-traceability.md](./journey-traceability.md).

| Fixture | Phase | Journey | Path |
|---------|-------|---------|------|
| promote-tool-refresh | CR0/CR2 | c01-J04, c01-J10 | `../fixtures/capability-runtime/promote-tool-refresh.json` |
| grant-scoped-tool-list | CR1 | c02-J09 | `../fixtures/capability-runtime/grant-scoped-tool-list.json` |
| install-policy-violation | CR0 | c01-J16 | `../fixtures/capability-runtime/install-policy-violation.json` |
| reconnect-outbox-replay | CR2 | c01-J13 | `../fixtures/capability-runtime/reconnect-outbox-replay.json` |
| rollback-live-mount | CR0/CR2 | c01-J11 | `../fixtures/capability-runtime/rollback-live-mount.json` |
| happy-path-publish | FS0 | c01-J20 | `../fixtures/feature-spec/happy-path-publish.json` |
| publish-direct-denied | FS0 | c01-J10 | `../fixtures/feature-spec/publish-direct-denied.json` |
| revise-republish-v2 | FS0 | c01-J06 | `../fixtures/feature-spec/revise-republish-v2.json` |
| spec-summary-query | FS0/XS0 | c02-J14 | `../fixtures/feature-spec/spec-summary-query.json` |
| spec-published-dedup-key | TR1 | c01-J06 | `../fixtures/feature-spec/spec-published-dedup-key.json` |
| feature-spec-v1 contract | FS0 | — | `../fixtures/feature-spec/contracts/feature-spec-v1.json` |
| spec-published-wake-dev | TR1 | c01-J02, E2E | `../fixtures/triggers/spec-published-wake-dev.json` |
| dedup-spec-publish | TR1 | c01-J06 | `../fixtures/triggers/dedup-spec-publish.json` |
| trigger-backend-frontend | TR1 | c01-J02 | `../fixtures/config/trigger-backend-frontend.json` |
| same-hub-ask-answer | XS0 | c02-J14 | `../fixtures/cross-space/same-hub-ask-answer.json` |
| query-failed-timeout | XS0 | ADR-15 | `../fixtures/cross-space/query-failed-timeout.json` |
| query-policy-denied | XS0 | c02-J14 | `../fixtures/cross-space/query-policy-denied.json` |
| cloud-admin-first-space | CL0 | c01-J15, c02-J11 | `../fixtures/cloud/cloud-admin-first-space.json` |
| **phase2-full-chain** | E2E | all | `../fixtures/e2e/phase2-full-chain.json` |

**E2E gate:** [phase2-full-chain.json](../fixtures/e2e/phase2-full-chain.json) after all layer fixtures green.
