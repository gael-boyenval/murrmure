# Meetings — documentation surfaces

**Status:** analysis (2026-08-17). Not a ship checklist until the matching code slice lands.  
**Order:** spec → bridge → reference → tutorial → example → skill.

`current/` is shipped+tested. Do **not** describe meetings as live in `apps/docs/` or skills until the protocol exists. Pointers already in `current/` must keep saying **unshipped**.

---

## 0. Already written (draft only)

| Path | Role now |
|------|----------|
| [spec.md](./spec.md) | Protocol design (hardened §0) |
| [pitfalls.md](./pitfalls.md) | Locked decisions vs code |
| [architecture.md](./architecture.md) | Placement + slice order |
| [code-surfaces.md](./code-surfaces.md) | File-by-file homes |
| [persistence.md](./persistence.md) | Journal vs snapshot |
| [space-catalog.md](./space-catalog.md) | Personas + handlers |
| [flow-step.md](./flow-step.md) | `meeting:` facet |
| [wire.md](./wire.md) | HTTP / MCP |
| [cli.md](./cli.md) | `mrmr meeting start` |
| [shell-lens.md](./shell-lens.md) | Shell Transcript |
| [testing.md](./testing.md) | Test placement |
| [tutorial-plan.md](./tutorial-plan.md) | Tutorial 1b writer brief — **pages not written** |
| [ADR-016](../../ADR/ADR-016-meeting-protocol.md) | Ownership |
| [README.md](./README.md) | Slice index |
| `current/index.md` | Draft row → this plan |
| `current/product/philosophy.md` | Deferred “multiple agents” → this plan |
| `current/product/deferred.md` | Meetings row (remove on ship) |
| `current/shell/spec.md` | One-line unshipped pointer |

On ship: **promote** [spec.md](./spec.md) → `current/meetings/spec.md`, [wire.md](./wire.md) → `current/bridges/meetings.md`, [shell-lens.md](./shell-lens.md) → `current/shell/spec.md` (merge). Keep ADR-016. Archive or stub this folder. Do **not** promote pitfalls / architecture / testing / tutorial-plan as `current/` — those stay plan or become review notes.

---

## 1. Normative (`studio-specs/current/`) — must

These become the source of truth. Drift vs code is a blocking review finding.

| Path | Why | Touch |
|------|-----|--------|
| **`current/meetings/spec.md`** | **New.** Promote [spec.md](./spec.md). | Create |
| **`current/bridges/meetings.md`** | **New.** HTTP/MCP/denial wire map. | Create |
| **`current/index.md`** | Move draft row to Flow platform table + fixtures column. | Edit |
| **`current/product/spec.md`** | Journal §8.2 (`mrmr.meeting.*`); session meeting projection; MCP §10.9 new tools; grants if any; “step = id/description/branches only” vs `meeting:` facet. | Edit |
| **`current/product/architecture.md`** | Entity map + anti-pattern (chat is not a View). | Edit |
| **`current/product/philosophy.md`** | Space layout + `personas.yaml`; Arc 2 “multiple roles” now specified; deferred row **removed** (shipped); related specs. | Edit |
| **`current/product/deferred.md`** | Delete meetings row on ship. | Edit |
| **`current/overview.md`** | Session = also a room; Desktop observes transcript. | Edit |
| **`current/acceptance.md`** | Rows from spec §17 + shell-lens §6. | Edit |
| **`current/shell/spec.md`** | Routes: `/sessions/:id` Transcript default for meetings; no `/meetings`; no compose. Replace draft pointer with normative. | Edit |
| **`current/cli/spec.md`** | `mrmr meeting start` (and any status/close). Command index. | Edit |
| **`current/bridges/handlers.md`** | `on.event.participant`; `PERSONA_HANDLER_UNSCOPED`; platform `mrmr.meeting.*` without `events.yaml`. | Edit |
| **`current/bridges/step-contract.md`** | `meeting:` facet (like `artifact_slots`). “Nothing else” is no longer true. Apply reject unknown meeting fields. | Edit |
| **`current/bridges/flow-engine.md`** | Open meeting step → convene; close → resolve. `MEETING_ALREADY_OPEN`. | Edit |
| **`current/bridges/triggers.md`** + **`triggers/spec.md`** | Handler delivery **attach** to `session_id` for meeting events (today always `createSession`). | Edit |
| **`current/hub/architecture.md`** | Signal/event types; control-bus notify into live assignment. | Light |
| **`current/hub/contracts.md`** | If it lists journal/MCP catalogs. | Light |
| **`current/cross-space/spec.md`** | One line: meetings ≠ `query_ask`. | Light |
| **`current/bridges/artifacts.md`** | Roster as `authorized_readers` on `said` artifacts. | Light |
| **`current/bridges/grants-migration.md`** | Only if a new scope appears (v1: reuse `space:read` / `event:emit` / `journal:read` / `flow:run`). | Maybe skip |
| **`current/fixtures/meetings/`** | **New.** Golden convene / said / close / transcript. | Create |

**Do not** add a kernel `.mrmr/views/meeting`. Validation Views stay space-authored; docs must say that.

---

## 2. ADR

| Path | Why |
|------|-----|
| **ADR-016** | Already accepted. On ship: status stays accepted; drop “unshipped” in the index row. |
| **ADR-007 / step-contract** | `meeting:` is a protocol facet. Short amendment or “see ADR-016” — do not silently contradict “step has nothing else.” |
| **ADR-013** | Meeting assignment block: trigger + `since_seq`, no transcript dump. Cross-link. |

---

## 3. User docs (`apps/docs/`) — must on ship

Nav: [`apps/docs/.vitepress/config.ts`](../../../apps/docs/.vitepress/config.ts).

### New pages

| Path | Job |
|------|-----|
| **`guide/meetings.md`** | What a meeting is; seats vs agents; start via Run / MCP / CLI; read via Sessions; not a View. |
| **`guide/tutorials/02-meetings/`** | **New tutorial 1b** (not a rewrite of 1a). Writer brief: [tutorial-plan.md](./tutorial-plan.md). Two personas + one other space, flow with `meeting:` step, shell Transcript, close. Pages land in **slice 8** only. |
| **`guide/tutorials/index.md`** + vitepress sidebar | Link the new tutorial **after** 1a. |

### Existing pages that will lie if untouched

| Path | Change |
|------|--------|
| **`guide/space-index.md`** | Layout: `personas.yaml`, `events.yaml` already missing here — add both; personas ads. |
| **`guide/space-handlers.md`** | `on.event.participant`; meeting handlers = `mcp_session`; no chat View. |
| **`guide/creating-flows.md`** | Step contracts + optional `meeting:`; close resolves the step. |
| **`guide/shell-routes.md`** | `/sessions/:id` Transcript; no `/meetings`; typical “watch a meeting.” |
| **`guide/how-it-fits-together.md`** | Desktop also reads agent talk; agents `said` / transcript pull. |
| **`guide/agents-mcp.md`** | New tools; emit `session_id`; do not paste journal. |
| **`guide/cli.md`** | `mrmr meeting start`. |
| **`guide/known-gaps.md`** | While unshipped: optional “Meetings: design only” row. On ship: move to “what works.” `check-known-gaps` may need a fixture if we add a row. |
| **`guide/desktop.md`** | Sessions badge / Transcript (short). |
| **`guide/quick-start.md`** | **Do not** make meetings the 5-minute path. One “also: meetings” link max. |
| **`reference/http-api.md`** | `POST /v1/meetings`, `GET …/personas`, `GET …/transcript`. |
| **`reference/mcp-tools.md`** | `murrmure_list_personas`, `murrmure_start_meeting`, `murrmure_meeting_transcript`; emit meeting payload. **`docs-proof` reads this file.** |
| **`reference/shell-client.md`** | Transcript fetch + close if the client grows methods. |
| **`reference/agent-skill.md`** + **`guide/agent-skill.md`** | Point at skill-agent meeting bits. |

### Leave alone (or “see also” only)

| Path | Why |
|------|-----|
| Tutorial **1a** (all 6 parts) | First-flow path. Do not insert meetings. |
| **`guide/review-workflow.md`** | Different product example. |
| **`guide/multi-agent-feature-spec.md`** | Historical; optional “related: meetings.” |
| **`reference/view-sdk.md`** | Chat is not a View. Optional one-liner. |
| **`guide/future/cloud.md`**, install, troubleshooting, env | Only if a new env/flag appears. |

---

## 4. Skills — must on ship

| Path | Change |
|------|--------|
| **`packages/cli/skill-developer/reference/space-directory.md`** | `personas.yaml` in the tree. |
| **`packages/cli/skill-developer/reference/flow-authoring.md`** | `meeting:` facet; portable spaces via `{{input.*}}`. |
| **`packages/cli/skill-developer/SKILL.md`** | Personas + meeting step in the authoring loop. |
| **`packages/cli/skill-agent/reference/mcp.md`** | New tools; `said` shape; transcript `since_seq`; **no** full journal paste. |
| **`packages/cli/skill-agent/SKILL.md`** | When in a meeting assignment: pull transcript, emit `said`, do not `resolve_step` unless closing a non-meeting step. |
| **`packages/cli/skill-agent/reference/known-gaps.md`** | Drop “meetings missing” when shipped. |
| **Repo / user copies** | `.cursor/skills/murrmure-agent/` (this repo) and published skill installs — same as skill-agent or they drift. |

---

## 5. Examples, scaffolds, fixtures

| Path | Change |
|------|--------|
| **`packages/cli/src/lib/space-scaffold.ts`** + space `init` templates | Optional empty `personas.yaml` comment, or leave unscoped (apply must not require the file). |
| **`packages/cli/templates/space/flows/`** | Optional `hello-meeting` template — **not** required for v1; don’t overload hello-gate. |
| **`test-utils/spaces/`** | **New** meeting fixture (two personas + second space or mocked roster). Strict-apply + daemon tests. |
| **`studio-specs/current/fixtures/spaces/minimal-mrmr/`** | Only if minimal apply must tolerate/ignore `personas.yaml`. |
| **`examples/`** | Empty today. Skip unless we add a public example. |
| Repo **`.mrmr/`** | Do not turn the monorepo space into the meeting demo. |

---

## 6. Enforcement (will fail or stay silent)

| Gate | Risk |
|------|------|
| **`packages/cli/test/docs-proof.test.ts`** | Asserts `mcp-tools.md` tool names. New tools must be added here or CI fails / docs lie. |
| **`scripts/check-known-gaps.mjs`** | If known-gaps gains a meetings row, keep the checker in sync. |
| **`scripts/check-fdk-docs.mjs`** | Unlikely unless we mention FDK. |
| **`scripts/check-doc-tracker.mjs`** | If a tracker lists user-doc pages. |
| **`pnpm check:docs-proof` / `docs:build`** | Sidebar + new pages must build. |
| **Apply / handler parse tests** | `meeting:` unknown field will fail today’s **strict** step schema — tests + docs must flip together. |
| **Clean-slate / removal-matrix** | Don’t describe meetings as a View or resurrect `wait:`/`gate:`. |

---

## 7. Operator changelog

| Path | When |
|------|------|
| **Root `CHANGELOG.md`** | Ship: convene, personas, Transcript, MCP tools, `meeting:` step. |
| Package changelogs | Only if you keep per-package logs. |

---

## 8. Per-slice doc done-gates

Do not write the tutorial in slices 0–7. Pages = slice **8** ([tutorial-plan.md](./tutorial-plan.md) §8). Slice numbers: [architecture.md](./architecture.md) §5.

| Slice | Docs that must land with the code |
|-------|-----------------------------------|
| **0 Characterization** | None |
| **1 Catalog** | `personas.yaml` in space-index + skill-developer directory; same-space `GET …/personas` in http-api + mcp-tools; philosophy layout; apply schema docs. |
| **2 Emit + attach** | Journal types; handlers `participant`; emit `session_id`; triggers “attach not createSession”; HTTP `event:emit`; hub-only denylist. Fix `bridges/triggers.md` if it still says `events.yaml` gates emit. |
| **3 Room protocol** | Denial codes; convene HTTP; `spaces_touched`; close XOR resolve. |
| **4 Transcript + prompt** | http-api + mcp `murrmure_meeting_transcript`; **`murrmure.meeting/v1`** (not step ADR-013 copy); skill-agent: pull, don’t paste, don’t `resolve_step` the room. |
| **5 Join-once** | Skill-agent + handlers: prefer `mcp_session`; **new** notify method (not “pending-wake”). If slipped, docs must say first-wake + queue. |
| **6 Shell lens** | `current/shell/spec.md`; `guide/shell-routes.md`; `how-it-fits`; desktop; Close mutation; canvas does not kill Transcript; **no** View tutorial for chat. |
| **7 Meeting step** | step-contract + ADR-007 amendment + creating-flows + flow-authoring; CLI `flow run` story. |
| **8 Tutorial + promote** | meetings tutorial + `guide/meetings.md` + changelog + known-gaps “works” + `current/meetings/spec.md`. |

---

## 9. Anti-patterns for this doc wave

- User tutorial that says “build a meeting View.”
- Updating Tutorial 1a instead of a new tutorial.
- Skills that tell agents to dump `journal_query` into context.
- `current/` promoted while `apps/docs` still silent (or the reverse).
- Documenting `wait:` / `gate:` as the meeting step.
- Treating ADR-016 as enough and skipping `current/meetings/spec.md`.
