# demo-space

Minimal Murrmure space used in CI and docs-proof to verify `mrmr space apply --strict` on a linked tree with handlers and a protocol-only flow manifest.

This is **not** a tutorial example — see `examples/flows/` for full workflow references. Kept as a tiny, fast strict-apply fixture separate from the larger preview-review example.

Layout:

- `.mrmr/space/` — `space.yaml`, `handlers.yaml`
- `.mrmr/flows/demo/` — one-step `demo` flow (agent step + `hello` handler)

Legacy `murrmure/` layout was removed in the handlers cutover (2026-07-09).
