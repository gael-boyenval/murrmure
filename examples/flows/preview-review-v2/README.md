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
.mrmr/
  flows/preview-review/flow.manifest.yaml
  views/preview-review/          # review canvas (iframe + comments)
  views/preview-review-intake/   # spec intake (no preview URL)
  space/handlers.yaml            # step.opened handlers (contract_keys)
```

## Apply

From this directory (space root):

```bash
cd .mrmr/views/preview-review && npm install && npm run build
cd ../preview-review-intake && npm install && npm run build
cd ../../..
mrmr space apply --strict
```

## Run

Open the linked space in Desktop, run **preview-review**, complete intake, then review in **ViewCanvasHost** until validated. Build agent resolves **`build.build-loop`** with `preview_url`; engine opens **`build.review`**.

## Connect agent (thin MCP)

Use the thin MCP bridge shape only (`murrmure-mcp` + `MURRMURE_HUB_TOKEN`):

```bash
mrmr grant mint --space spc_... --label "cursor-agent"
mrmr grant use --space spc_...
```

For repo-local setup, add `--local --write-mcp` to `mrmr grant mint`.
