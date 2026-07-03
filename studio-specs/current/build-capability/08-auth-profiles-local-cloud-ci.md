# Auth profiles — local, cloud, CI

**Status:** normative (2026-06-20)

---

## Profiles

| Profile | Actor | Auth to hub | CDK CLI |
|---------|-------|-------------|---------|
| **local-shell** | Human builder | Paste `tok_*` in shell `/connect` or env | `STUDIO_HUB_TOKEN` |
| **local-cli** | Human/agent builder | Bearer grant token | Env or `~/.studio/tokens/{label}.json` |
| **cloud-shell** | Human admin | Session cookie → BFF derived `tok_der_*` (60s) | N/A (browser Configure) |
| **ci** | Pipeline | `STUDIO_DEPLOY_TOKEN` (`dep_tok_*`) | CI env in GitHub Actions |

---

## Env resolution order (CLI)

1. `STUDIO_HUB_URL` + `STUDIO_HUB_TOKEN` + `STUDIO_SPACE_ID`
2. `~/.studio/hubs/shared.json` + default token file
3. `--hub-url` / `--token` / `--space` flags

`studio capability doctor` prints resolved profile and missing scopes.

---

## Scope requirements by command

| Command | Min scopes |
|---------|------------|
| `push` (draft) | `capability:install` |
| `validate/test/promote` | `capability:install` |
| `apply` | `capability:install`; human actor if `human_only` |
| `dev` | `capability:install` on target space |

Agents: sandbox spaces only for push (PAR-03). Prod apply requires human token.

---

## Cloud BFF

Browser never uses MCP bearer as cookie. Configure calls `studio.example.com/api/hub/v1/…` → BFF mints derived token → hub.

CDK `push` from laptop targets hub URL directly (local-cli), not BFF — unless `STUDIO_HUB_URL` points at BFF with session (unsupported v1).

---

## CI push

```http
POST /v1/ci/capabilities/push
Authorization: Bearer dep_tok_…
```

Runs: multipart bundle → validate → test → promote (if breaking gate N/A) → apply.

Deploy token: single space, `capability:install`, rotateable. No `space:admin`.

Attestation (OD-S4): CI must attach test run id in `source_metadata.ci_run_id`.

---

## Capability UI auth (iframe)

User bundle inside iframe receives **short-lived derived token** via `postMessage` from shell — not parent cookie (ARCH-02). See [09-security-execution-boundaries.md](./09-security-execution-boundaries.md).

---

## Related

- [06-install-push-apply-http-contract.md](./06-install-push-apply-http-contract.md)
- [archives/plans/cloud/spec.md](../../archives/plans/cloud/spec.md) (**NOT SHIPPED**)
