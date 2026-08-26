# Meetings — design slice (hardened)

**Status:** draft (2026-08-17, specification hardening)  
**ADR:** [ADR-016](../../ADR/ADR-016-meeting-protocol.md)

Unshipped notes. **`studio-specs/current/` wins.** Default meeting seat is
`shell_spawn` with an initial command plus an opaque-token continuation command.
Active processes may receive `notify_live`; exited one-shot harnesses resume.
The `mcp_session` / “do not shell_spawn” lines in this folder are superseded.

On conflict inside this folder: [pitfalls.md](./pitfalls.md) wins, except where
`current/` disagrees.

## Goal

Spaces (and multiple personas in one space) share one session as a room: text, artifacts, optional reply-to, address one or many seats (or all), async turns, delivery receipts, chair or human close. Hub stays the wire.

## Surface files

One spec per product surface. Implement against these, not chat.

| Surface | File | Job |
|---------|------|-----|
| **Protocol** | [spec.md](./spec.md) | Nouns, events, denials, acceptance §17 |
| **Locked decisions** | [pitfalls.md](./pitfalls.md) | Code lies + D1–D18 |
| **Architecture** | [architecture.md](./architecture.md) | Placement, refactors R1–R7, slice order |
| **Code surfaces** | [code-surfaces.md](./code-surfaces.md) | File-by-file homes + do-not-touch |
| **Persistence** | [persistence.md](./persistence.md) | Journal vs snapshot vs index |
| **Space catalog** | [space-catalog.md](./space-catalog.md) | `personas.yaml`, `on.event.participant` |
| **Flow step** | [flow-step.md](./flow-step.md) | `meeting:` facet, close XOR resolve |
| **Wire** | [wire.md](./wire.md) | HTTP / MCP / emit |
| **CLI** | [cli.md](./cli.md) | `mrmr meeting start` — no wizard |
| **Shell** | [shell-lens.md](./shell-lens.md) | Transcript chrome, Close mutation |
| **Testing** | [testing.md](./testing.md) | Pyramid, files, characterization |
| **Tutorial** | [tutorial-plan.md](./tutorial-plan.md) | 1b / `02-meetings/` — pages **not** written |
| **Doc wave** | [doc-surfaces.md](./doc-surfaces.md) | What to update on ship |
| **Artifact MCP gap** | [meeting-artifact-mcp-slice.md](./meeting-artifact-mcp-slice.md) | Living spec: `put_artifact`, grants, attach docs (from KB goal-check) |

## Hardened implementation slices

Characterization **before** feature code. Join-once is a **new** primitive.

| # | Slice | Lands | Honest if slipped |
|---|-------|-------|-------------------|
| **0** | Characterization | Pin today’s `createSession` on non-meeting emit | — |
| **1** | Catalog | Personas index, `participant`, apply denials | — |
| **2** | Emit + attach | Journal-first emit; delivery modes; HTTP `event:emit` | — |
| **3** | Room protocol | Convene / said / close / snapshot / `spaces_touched` | — |
| **4** | Transcript + prompt | Session API; `meeting_seq`; `murrmure.meeting/v1` | — |
| **5** | Join-once | Live map + notify assignment-mode does not drop | First-wake + queue; tutorial Part 5 must not lie |
| **6** | Shell lens | Transcript default; Close; canvas does not kill Transcript | — |
| **7** | Meeting step | `meeting:` facet; open convenes; close advances | — |
| **8** | Tutorial + promote | [tutorial-plan.md](./tutorial-plan.md); `current/` | Do not write pages in 1–7 |

Crash / dead-host spawn is **not** a slice.

**No open product forks.** Former O1–O8 + seq/chair/seat/join are locked in [pitfalls.md](./pitfalls.md) D19. Implement slices 0→8 in order.

## Doc impact (when implementing)

| Layer | Paths | Done-gate |
|-------|--------|-----------|
| Design (this folder) | all files above | Promoted or superseded; no silent drift |
| Normative | `current/meetings/spec.md` (new), `current/index.md`, journal types in `product/spec.md` §8.2, philosophy deferred row | `current/` matches code |
| Bridge | `current/bridges/meetings.md` (new); handlers `on.event.participant`; emit requires `session_id` | HTTP/MCP tables match daemon |
| ADR | ADR-016 stays accepted; ADR-007 “nothing else” amended with `meeting:` | No Agent entity, no transcript dump |
| Shell | `current/shell/spec.md` — session Transcript pane | Chat is shell, not a View |
| User docs | `apps/docs/` — meeting tutorial / reference only after ship | No docs describing unshipped room as live |
| Skills | `skill-developer` `personas.yaml`; `skill-agent` emit + transcript; **meeting envelope** | Skills match catalog |
| Examples | `test-utils/spaces/meetings-app` + `meetings-research` | Strict-apply + [testing.md](./testing.md) |
| Changelog | root `CHANGELOG.md` when operator-visible | Ship note |

**Update order:** spec (here → `current/`) → bridge → reference → tutorial → example → skill.

## Out of this folder

Memory system (parked). `query_ask` stays the typed door.
