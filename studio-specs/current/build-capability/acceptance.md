# Build capability — acceptance

Fixtures: [13-conformance-fixtures-matrix.md](./13-conformance-fixtures-matrix.md) · root `../fixtures/build-capability/`

---

## BC-min (local author → live on same machine)

| # | Scenario | Proves |
|---|----------|--------|
| 1 | `studio capability init demo-flow` in `/tmp/my-workflows` | Scaffold outside platform repo |
| 2 | Generated scaffold has root `package.json` with exact pins + `@studio/capability-dev-kit` + React error-state components | Strict React + locked semver policy |
| 3 | Edit contract + React UI mount | User project is source of truth |
| 4 | `validate --json` + `build` | Stage + deterministic digest |
| 5 | `push --space spc_sandbox` + `.push-state.json` | Draft install; install_id recoverable |
| 6 | `doctor` then validate → test → promote → apply | Evolution pipeline |
| 7 | Runtime iframe loads user UI | Sandboxed canvas (ARCH-02) |
| 8 | MCP tool from bundle callable | Dynamic catalog |
| 9 | Configure `/capabilities/new` shows CDK steps | BC2a onboarding |

---

## BC-full

| # | Scenario | Proves |
|---|----------|--------|
| 10 | Second capability, different `routes_prefix` | No collision |
| 11 | MCP tool name collision at apply | `MCP_TOOL_COLLISION` |
| 12 | Breaking promote → human gate | User contract diff |
| 13 | Agent apply on `human_only` prod | `INSTALL_POLICY_VIOLATION` |
| 14 | Grant ACL excludes package | Grant-filtered catalog |
| 15 | Rollback; in-flight instance keeps pinned contract | ARCH-05 |
| 16 | `studio capability dev` reload | SSE + iframe reload |
| 17 | `studio capability dev --sim` starts thin server + simulated install/instance state machines | BC5b local runtime |
| 18 | Scaffolded Playwright suite passes against simulated runtime | Offline local E2E parity |
| 19 | `BUNDLE_DIGEST_MISMATCH` on tampered upload | ARCH-04 |
| 20 | Worker serves routes; hub main never imports user code | ARCH-01 |
| 21 | `studio skill install --dir /tmp/x` | Skill tree copied ([15](./15-agent-skill-package.md)) |
| 22 | `studio capability init foo --with-skill` | `.cursor/skills/studio-capability/` in cwd |
| 23 | `studio skill update` after VERSION bump | Idempotent overwrite |
| 24 | `@studio/skill` vitest `install.test.ts` | Package regression guard |

---

## Phase checklist

| Phase | DoD |
|-------|-----|
| BC0 | Offline validate + stage layout ([05](./05-manifest-and-bundle-schema.md)) |
| BC1 | Build ui/server + shell.html |
| BC2 | Push v2 + push-state + doctor + BC2a Configure new page |
| BC3 | Iframe host + error states |
| BC4 | Worker mount + MCP from bundle |
| BC5 | Dev loop ([11](./11-dev-loop-reload-protocol.md)) |
| BC5b | Simulated dev loop (`dev --sim`) + Playwright harness |
| BC6b | Path picker + shared.json registry |
| BC15 | Agent skill install/update ([15](./15-agent-skill-package.md)) |

**Ship when:** BC-min rows 1–9 green.

---

## Explicit exclusions

- Bundled catalog install from platform SPA
- In-process hub import of user server code
- Shell-origin dynamic import of user UI
- Domain UI in `@murrmure/shell-web`
