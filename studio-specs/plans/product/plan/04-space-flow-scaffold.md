# Phase 04 — Space flow scaffold

**Status:** ✅ complete  
**Execution order:** **4 / 10**  
**Feedback:** [flow-init-role-stubs](../../../../feedbacks/2026-07-02-improvement-flow-init-role-stubs.md)  
**Depends on:** [01](./01-apply-validation.md), [02](./02-view-sdk.md) (view template)  
**Decisions:** [05 triggers/checkpoint](./decisions/05-triggers-only-checkpoint-steps.md) · [09 space-scoped CLI](./decisions/09-cli-scaffold-space-scoped.md)  
**Unblocks:** [08](./08-cli-setup-wizards.md), [06](./06-reference-workflow-preview-review.md)

---

## Problem

Authors need a guided path from zero → working flow + **React view** + checkpoint loop. `mrmr flow init` scaffolds FDK workers (deleted phase 09). Standalone view init alone does not create the flow graph.

---

## Command spec

```bash
mrmr space flow init <id> [--template hello-gate|hello-invoke]
mrmr space view init <id>   # standalone view package ([decision 09](./decisions/09-cli-scaffold-space-scoped.md))
```

### Output tree (`hello-gate` template — matches [06](./06-reference-workflow-preview-review.md))

```text
murrmure/
  actions.yaml
  flows/<id>/flow.manifest.yaml    # intake checkpoint → build → review checkpoint w/ on_resolve loop
  views/preview-review/            # Vite+React per phase 02
  views/<id>-intake/               # optional step-0 checkpoint view
  scripts/<id>-build.mjs           # shell_spawn; reads MURRMURE_INPUT + step outputs
  hooks.yaml                       # commented example
```

**≤7 files** for hello-gate (view package counts as one logical unit). Role comment at top of each file.

### `flow.manifest.yaml` (hello-gate template)

Must match [06-reference-workflow-preview-review.md](./06-reference-workflow-preview-review.md) shape:

```yaml
triggers:
  manual: true
steps:
  - id: intake
    checkpoint:
      view: preview-review-intake
      on_resolve:
        default: { goto: build }
        cancel: { fail: true }
  - id: build
    invoke: …
  - id: review
    checkpoint:
      view: preview-review
      on_resolve:
        when: output.outcome
        values:
          validated: { goto: done }
          changes_required: { goto: build }
        default: { goto: done }
        cancel: { fail: true }
```

**No** `start.requires_view`. **No** separate start params view on trigger block.

### Naming guard

`mrmr flow init` in repo with `murrmure/`:

```text
stderr: Use `mrmr space flow init` for indexed flows. FDK init is removed in v2.
exit 1
```

`mrmr view init` → redirect to `mrmr space view init`.

---

## Definition of done

### Code

- [x] `packages/cli/src/commands/space/flow-init.ts`
- [x] `packages/cli/src/commands/space/view-init.ts`
- [x] Templates: `packages/cli/templates/space/flows/hello-invoke/`, `hello-gate/`
- [x] `hello-gate` embeds phase 02 view template for `preview-review` + intake view
- [x] Naming guards in `flow/commands.ts` and view commands

### Tests

- [x] Snapshot: hello-gate tree; `space apply --strict` succeeds after `npm run build` in views
- [x] Fixture `fixtures/space-flow-init-hello-gate.json`

### Docs

- [x] CLI spec, creating-flows.md, skill space-directory.md
- [x] Remove B6 from known-gaps

### Proof

| ID | Pass |
|----|------|
| 04-U1 | `space flow init preview-review --template hello-gate` → build views → apply strict OK |
| 04-U2 | `flow init` redirect message |
| 04-U3 | Built view runs `npm run build` from scaffold `package.json` |

---

*End of phase 04.*
