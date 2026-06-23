# Deprecated — legacy US-001 stack

These packages are the original US-001 daemon/web stack. They are kept for
historical reference only and are intentionally excluded from the pnpm workspace
(`pnpm-workspace.yaml`), the root `typecheck`, and the vitest projects. Nothing
in the active platform (`packages/`, `apps/docs`, `examples/`) depends on them.

| Path | Former name | Replaced by |
|------|-------------|-------------|
| `daemon/` | `@studio/daemon` | `packages/studio-hub-daemon` |
| `web/` | `@studio/web` | `packages/shell-web` |
| `client/` | `@studio/client` | `packages/studio-hub-client` |

Do not implement new work here. The normative platform specs live in
`studio-specs/current/`.

Legacy `@studio/review-contracts` types live in `deprecated/review-contracts/`
(a self-contained stub; the original package was removed during debundle).
