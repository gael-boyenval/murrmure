# Meetings — CLI surface

**Status:** draft (hardening 2026-08-17)  
**Shipped CLI:** [current/cli/spec.md](../../current/cli/spec.md)  
**Wire:** [wire.md](./wire.md)

Operator mirror of HTTP. No wizard. No shell composer.

---

## 1. Commands

Register in `packages/cli/src/commands/root.ts` like `flow` / `step`.

| Command | HTTP | Requires | Notes |
|---------|------|----------|-------|
| `mrmr meeting start` | `POST /v1/meetings` | `flow:run` (preflight) | Flags: `--title`, `--goal`, `--chair`, `--participant space[:persona]` (repeatable), optional `--session`. `--json` supported. |
| `mrmr flow run <flow_id>` | existing | `flow:run` | Dashboard-equivalent start when the flow has `meeting:`. Prefer this for humans. |
| `mrmr meeting transcript <session_id>` | `GET …/transcript` | `journal:read` | Optional `--since-seq`. Human table; `--json` = DTO. **v1 optional** — MCP is the agent path. |
| `mrmr meeting close <session_id>` | `POST …/meeting/close` | chair / human | Optional `--reason` / `--outcome`. **v1 optional** if shell Close ships first. |

`help-contract.test.ts` requires `Requires:` on every new leaf.

Do **not** add `mrmr meeting new` interactive prompts.

---

## 2. Apply / doctor

`mrmr space apply` already posts the bundle. Must start reading `personas.yaml` ([space-catalog.md](./space-catalog.md)).

`mrmr space doctor` / `space status`: optional count of indexed personas. Not required for v1.

---

## 3. Scaffold

`mrmr space init` / setup: **do not** add a hello-meeting flow. Optional empty `personas.yaml` comment, or omit.

---

## 4. Acceptance

- `mrmr meeting start --json` hits the same body as MCP `murrmure_start_meeting`.
- Help lists `Requires: flow:run`.
- No wizard questions.
- Tutorial Part 7 may show this as a twin of MCP; Parts 3–6 use **Run**.
