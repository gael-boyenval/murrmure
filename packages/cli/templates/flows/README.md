# Example capabilities

Reference capabilities built with the Capability Developer Kit (CDK). They are
**not** part of the platform workspace — they model capabilities authored
outside the Studio monorepo. Tests and docs use them as the canonical CDK
examples.

| Example | What it shows |
|---------|---------------|
| [`feature-spec/`](./feature-spec/) | Stateful document lifecycle + cross-space `spec_summary@1` query |
| [`review-loop/`](./review-loop/) | Gated review rounds with a comment-thread canvas |

## Scaffold a new capability from an example

```bash
mrmr flow init my-capability --from-example feature-spec
```

## Build every example

```bash
node examples/flows/scripts/build-all.mjs
```

Each example is validated and built (UI + server bundled, `manifest.json`
resolved, `bundle.digest` computed) into the per-user stage directory
(`~/.murrmure/flows/<id>/<version>`).

## Runtime note

Both examples run as **worker bundles** after CDK install + live apply. Kernel
access goes through the host-bridge (`ctx.hub`). See
[`studio-specs/current/build-capability/12-worker-runtime-and-host-bridge.md`](../../studio-specs/current/build-capability/12-worker-runtime-and-host-bridge.md).
