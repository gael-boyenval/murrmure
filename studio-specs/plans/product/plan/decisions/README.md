# Plan decisions

Structured answers to open questions raised in [plan-review-1.md](../plan-review-1.md), [plan-review-2.md](../plan-review-2.md), and [plan-review-3.md](../plan-review-3.md).

Each file records **context**, **discussion**, **decision**, and **plan impact** so phase docs can be updated without re-litigating.

> **Plan impact paths:** decision files may reference rev-4 filenames (`03b-view-sdk.md`, `02-engine-completion.md`, etc.). **Rev-5 sequential mapping** is in [index.md § File map](../index.md#file-map-rev-5). Normative phase specs are **`01`–`10`** in execution order.

| # | Decision | Status |
|---|----------|--------|
| [01](./01-view-sdk-npm-distribution.md) | Publish `@murrmure/view-sdk` to public npm | ✅ Resolved 2026-07-03 |
| [02](./02-view-dev-loop.md) | `mrmr view dev` — author-owned build, fixtures, Desktop preview | ✅ Resolved 2026-07-03 |
| [03](./03-gate-view-context-shape.md) | Nested `gate` block; `responseSchema` not `form_schema` | ✅ Resolved 2026-07-03 |
| [04](./04-human-checkpoint-resolve-wire.md) | `disposition` + `output`; flow vs agent orchestration tutorials | ✅ Resolved 2026-07-03 |
| [05](./05-triggers-only-checkpoint-steps.md) | `triggers:` only; human UI on checkpoint steps; apply `dist/` lint | ✅ Resolved 2026-07-03 |
| [06](./06-checkpoint-on-resolve-explicit.md) | `on_resolve.default` + `on_resolve.cancel` required; no silent routing | ✅ Resolved 2026-07-03 |
| [07](./07-session-vs-run-user-facing.md) | Human UI: session/title; `run_` operator/debug only | ✅ Resolved 2026-07-03 |
| [08](./08-payload-ref-from-step-output.md) | `payload_ref` optional; from prior step output; no hub snapshot MVP | ✅ Resolved 2026-07-03 |
| [09](./09-cli-scaffold-space-scoped.md) | `mrmr space flow init` + `mrmr space view init` | ✅ Resolved 2026-07-03 |
| [10](./10-reference-workflow-verification-layered.md) | R1–R6: CI minimum + manual release + Playwright backlog | ✅ Resolved 2026-07-03 |
| [11](./11-fdk-test-disposition-inventory.md) | Per-test port/delete table required before phase 07 | ✅ Resolved 2026-07-03 |
| [12](./12-skill-eval-advisory-only.md) | Skill eval manual/release only; not CI gate | ✅ Resolved 2026-07-03 |
| [13](./13-hub-daemon-canonical-no-studio-duplicates.md) | `hub-daemon` canonical; M7 = verify no `studio-*` | ✅ Resolved 2026-07-03 |
| [14](./14-doc-tracker-warn-from-phase-01.md) | Doc tracker warn-only CI from phase 01 | ✅ Resolved 2026-07-03 |
