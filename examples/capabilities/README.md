# Example flows

Reference flows built with the Flow Dev Kit (FDK). They are **not** part of the
platform workspace — they model flows authored outside the Murrmure monorepo.
Tests and docs use them as the canonical FDK examples.

| Example | What it shows |
|---------|---------------|
| [`feature-spec/`](./feature-spec/) | Stateful document lifecycle + cross-space `spec_summary@1` query |
| [`review-loop/`](./review-loop/) | Gated review rounds with a comment-thread canvas |

## Scaffold a new flow from an example

```bash
mrmr flow init my-flow --from-example feature-spec
```

## Build every example

```bash
node examples/capabilities/scripts/build-all.mjs
```

Each example is validated and built (UI + server bundled, `manifest.json`
resolved, `bundle.digest` + `source.digest` computed) into the per-user stage
directory (`~/.murrmure/flows/<id>/<version>`).

## Runtime note

Both examples run as **worker bundles** after install + live apply. Kernel access
goes through the host-bridge (`ctx.hub`). See
[`studio-specs/current/build-capability/12-worker-runtime-and-host-bridge.md`](../../studio-specs/current/build-capability/12-worker-runtime-and-host-bridge.md).
