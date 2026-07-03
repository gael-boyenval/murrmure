# Preview review v2 (reference workflow)

Canonical Murrmure v2 human/agent review loop — normative spec:
[studio-specs/plans/product/plan/06-reference-workflow-preview-review.md](../../../studio-specs/plans/product/plan/06-reference-workflow-preview-review.md).

```text
intake checkpoint → build → review checkpoint ⇄ build → done
```

## Layout

```text
murrmure/
  flows/preview-review/flow.manifest.yaml
  views/preview-review/          # review canvas (iframe + comments)
  views/preview-review-intake/   # step-0 intake form
  scripts/preview-review-build.mjs
  actions.yaml
  executors.yaml
```

## Apply

From this directory (space root):

```bash
cd murrmure/views/preview-review && npm install && npm run build
cd ../preview-review-intake && npm install && npm run build
cd ../../..
mrmr space apply --strict
```

## Run

Open the linked space in Desktop, run **preview-review**, complete intake, then review rounds in **ViewCanvasHost** until validated.

Pattern A (flow-owned loop): engine advances via `on_resolve` goto. Pattern B (agent-owned): same views; agent uses `murrmure_wait_for_gate` between rounds — see spec § Orchestration variants.
