# Preview review v2 (reference workflow)

Mixed orchestration reference — normative spec:
[studio-specs/plans/product/plan/06-reference-workflow-preview-review.md](../../../studio-specs/plans/product/plan/06-reference-workflow-preview-review.md).

```text
intake → write_spec → build (build-loop ⇄ build.review) → archive → commit
```

**Engine-routed nested build:** one `cursor agent` session resolves **`build.build-loop`**; the engine opens **`build.review`** on the happy path. Feedback rounds stay in the same chat (`changes_required → goto: build-loop`, not a new `feature_build` invoke).

## Layout

```text
agent.md
skills/feature-build/SKILL.md
murrmure/
  flows/preview-review/flow.manifest.yaml
  views/preview-review/          # review canvas (iframe + comments)
  views/preview-review-intake/   # spec intake (no preview URL)
  actions.yaml                   # shell prompt triggers only
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

Open the linked space in Desktop, run **preview-review**, complete intake, then review in **ViewCanvasHost** until validated. Build agent resolves **`build.build-loop`** with `preview_url`; engine opens **`build.review`**.
