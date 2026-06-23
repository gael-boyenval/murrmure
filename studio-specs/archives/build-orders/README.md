# Studio — phase 2 build specification

**Assumes shipped:** kernel R0–R7, hub S0–S3, product P0–P5, config CS0–CS2, review-loop in-repo.

This directory is the **implementation spec for what's left** — grounded in [`inputs/studio/`](../../../inputs/studio/) use cases, not abstract layer names.

| Doc | Purpose |
|-----|---------|
| [**technical-index.md**](../technical-index.md) | **Technical specs to share** — normative + bridges + fixtures |
| [journey-traceability.md](./journey-traceability.md) | 40-journey map, comparative analysis, E2E story |
| [acceptance.md](./acceptance.md) | Fixture index |
| `01–05-*.md` | Per-layer build orders: why → who → story → DoD |

**Normative wire detail:** [`../`](../) — **not this folder**

---

## The problem phase 2 solves

Phase 1 shipped the **review loop** (J01) and **configure shell** (first-week checklist). Users can review UI in bounded spaces with human gates and audit.

They **cannot yet**:

- Install a second workflow (**feature-spec**) without rebuilding the daemon
- Auto-wake the frontend agent when backend publishes (**J02** — still Slack)
- Let agents fetch scoped context from another space without blob exfiltration (**c02-J14**)
- Run Studio admin from a **hosted browser** without pasting bearer tokens (**J15**)

Phase 2 closes the gap between "review app with MCP" and the product promise in [`studio-v3-overview.md`](../../../inputs/studio/studio-v3-overview.md): *capabilities you install, triggers that wire agents, grants that enforce least privilege*.

---

## Implement order

```
1. capability-runtime   CR0 → CR2   spine — everything else depends on live apply + mcp_wake
2. feature-spec         FS0 → FS2   proves dynamic mount; emits spec.published
3. triggers             TR0 → TR1   J02 + spec-published templates; dedup
4. cross-space          XS0 → XS1   query_ask replaces emit hacks; Théo policy
5. cloud-shell          CL0 → CL1   J15 hosted admin + CI push
```

XS0 can start after hub S3 (shipped) in parallel with CR1; XS1 needs configure policy UI.

---

## Done when

- [ ] [E2E story](./journey-traceability.md#e2e-story-all-phase-2-layers) completes without manual Slack/curl
- [ ] All fixtures in [acceptance.md](./acceptance.md) green
- [ ] [phase2-full-chain.json](../fixtures/e2e/phase2-full-chain.json) green
- [ ] Primary journeys in [traceability matrix](./journey-traceability.md#40-journey-ledger) walkthrough recorded

---

## Build specs

| File | Phases | Primary journeys |
|------|--------|------------------|
| [01-capability-runtime.md](./01-capability-runtime.md) | CR0–CR2 | J04, J10, J13, J16, J09 |
| [02-feature-spec.md](./02-feature-spec.md) | FS0–FS2 | J02, J20, c02-J14 |
| [03-triggers.md](./03-triggers.md) | TR0–TR1 | J02, J06, J07, J15 |
| [04-cross-space.md](./04-cross-space.md) | XS0–XS1 | J02, c02-J14, J09, J13 |
| [05-cloud-shell.md](./05-cloud-shell.md) | CL0–CL1 | J15, c02-J11, J12 |

---

## Out of scope

- review-loop-lite (J14)
- Gate delegation UI (J05)
- Filterable gate queue (J19)
- Capability marketplace / OAuth OIDC
- Cron trigger UI
