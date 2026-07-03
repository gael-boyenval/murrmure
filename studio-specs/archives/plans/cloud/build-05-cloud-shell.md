# CL0–CL1 — Cloud shell

**Normative:** [spec.md](./spec.md) · **Journeys:** [traceability § CL](../../archives/build-orders/journey-traceability.md#05--cloud-shell-cl0cl1)

**Prerequisite:** CS2 (shipped), CR0 (live apply for CI push)

---

## Why

**J15:** Dev's hub on laptop; Liam in Denver. Triggers fail when Dev's machine sleeps. Alex moves hub to **EC2** — operators still use Cursor locally, but **events route through always-on hub**.

**Local shell gap:** `/connect` requires paste hub URL + bearer into browser. Fine for solo dev; **unacceptable for team admin** (token in Slack, no expiry, no role separation).

**c02-J11:** Théo onboards new client in ~2 hours — spaces, grants, portal config — all from **browser**, no curl, no token paste.

**Versus "just use SSH":** Collaborators need browser-only (studio-v3-overview). Agents keep long-lived grants; **humans get session cookies** — never the same credential.

---

## Who

| Persona | Role |
|---------|------|
| Alex | Deploys cloud shell + hub; first space create |
| Maya / Priya | Browser collaborators — no configure |
| Sarah | Audit export from browser (J12) |
| CI pipeline | `dep_tok_*` push capability — not human session |

---

## User story — hosted admin (J15 + c02-J11)

1. Alex deploys `studio-cloud-bff` + shell SPA at `https://studio.example.com`
2. Alex logs in via magic link → httpOnly `studio_session` — **no tok_* in localStorage**
3. BFF proxies `/api/hub/v1/*` with 60s derived token per request
4. Alex creates `backend-api` + `ui-sandbox`, installs feature-spec, registers J02 trigger
5. Liam emits `work.ready` while Dev's laptop closed — EC2 hub delivers mcp_wake
6. Sarah exports 90-day audit from configure — SOC2 package (J12)

**CI story (CL1):** GitHub Action `POST /v1/ci/capabilities/push` with space-scoped deploy token → validate → test → live.apply

---

## Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| CL-R1 | Session cookie ≠ MCP bearer | J07 |
| CL-R2 | BFF derived token 60s TTL, space-scoped | J09 least privilege |
| CL-R3 | Configure parity: spaces, capabilities, grants, triggers | c02-J11 |
| CL-R4 | Viewer blocked from `/configure/*` | roles table |
| CL-R5 | CI push → live apply without human session | DevOps |
| CL-R6 | Relay/hub health on configure dashboard | J15 feedback |
| CL-R7 | Audit export download in browser | J12 |

---

## CL0 — Session + BFF + login

```
apps/studio-cloud-bff/
packages/session/
```

| Method | Path |
|--------|------|
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |
| ALL | `/api/hub/v1/*` → hub with derived tok |

**Shell:** `VITE_CLOUD_SHELL=1` → `/login` not `/connect`

**DoD:**

- [ ] `cloud-admin-first-space.json` (CL-R3)
- [ ] Session expiry → redirect login (CL-R1)
- [ ] Configure create space via BFF

---

## CL1 — CI push + hardening

```http
POST /v1/ci/capabilities/push
Authorization: Bearer dep_tok_…
```

Pipeline: draft → validate → test → live.apply (CR0)

**DoD:**

- [ ] CI token promotes feature-spec live (CL-R5)
- [ ] Collaborator cannot access configure (CL-R4)
- [ ] Rate limit login; derived token expiry test (CL-R2)

**Commit order:** CL0 → CL1
