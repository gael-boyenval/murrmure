# Part 2 — Apply and connect

Index the flow, link your space, and wire the agent MCP grant.

## 1) Build checkpoint views

Each view referenced in the manifest needs a production `dist/` before strict apply:

```bash
cd murrmure/views/preview-review-intake
npm install && npm run build
cd ../preview-review
npm install && npm run build
cd ../../..
```

## 2) Link and apply

```bash
mrmr space link --path . --space spc_ui_sandbox
mrmr space apply --strict
mrmr space status --space spc_ui_sandbox
```

Confirm `flows` includes `flw_flows_preview_review` (id may vary by slug).

## 3) Mint agent grant

```bash
mrmr grant mint --space spc_ui_sandbox \
  --capabilities flow:run,flow:read \
  --label preview-review-agent
```

Paste the token into your agent MCP config (see [Connect your agent](../../agents-mcp)).

Platform tools the agent uses:

- `murrmure_invoke_action` — run indexed actions when orchestrating manually
- `murrmure_wait_for_gate` / `murrmure_resolve_gate` — agent-owned loop (Part 3 §B)
- `murrmure_wait_for_run` — observe run checkpoint state

## 4) Verify in Desktop

Open **Murrmure Desktop** → your space → confirm the **preview-review** flow appears on space home.

Shell chrome (flowchart, gate inbox) is **operator/admin mode**. When you **Run**, checkpoint steps with `view_ref` open in **ViewCanvasHost**.

## Next

[Part 3 — Run the feedback loop →](./03-run-feedback-loop)
