# Meetings — code surfaces

**Status:** draft (hardening 2026-08-17)  
**Binds:** [architecture.md](./architecture.md) R1–R7 · [pitfalls.md](./pitfalls.md)

File-by-file map. Implement against this + the surface specs. Do not invent homes.

Meetings are **unshipped**. Two schema facts:

- `meeting:` on a flow step is **rejected** (`FlowStepSchema.strict()`).
- `on.event.participant` is **silently stripped**, not rejected. Matching is type+source only.

---

## 1. Hotspot ranking

| # | File | Why |
|---|------|-----|
| 1 | `packages/hub-core/src/hooks/dispatch.ts` | Always `createSession`. Split per R1 — **not** `if (isMeetingEvent)`. |
| 2 | `packages/hub-daemon/src/routes.ts` `POST /v1/spaces/:id/events` | No journal, no `session_id`, no `event:emit`. |
| 3 | `packages/hub-daemon/src/mcp-handlers.ts` emit | Drops `session_id`. Catalog can hide platform types. |
| 4 | `packages/hub-core/src/hooks/dispatch.ts` `eventExecContext` + `packages/hub-daemon/src/wake-prompt.ts` | Full payload → run input → wake **Data**. Transcript leak. |
| 5 | `packages/mcp-bridge/src/main.ts` | Assignment-mode **drops** `invoke_action` wakes. |
| 6 | `packages/hub-daemon/src/mcp-session-registry.ts` + `control-bus.ts` | Per **space**, not seat. `invoke_action` is a new action, not a nudge. |
| 7 | `packages/shell-web/src/routes/SessionPage.tsx` | Bound View **unmounts** operator chrome. |
| 8 | `packages/hub-core/src/flow-engine/step-contract-compile.ts` + `step-open.ts` + `step-resolve.ts` | Facet must survive compile; open convenes; close resolves. **No new IR kind.** |

---

## 2. Apply / catalog

| Path | Today | Change | Kind |
|------|--------|--------|------|
| `packages/contracts/src/entities/handler.ts` | `HandlerEventFilterSchema` = `{ type, source? }` (not strict). Extra keys **stripped**. | Add `participant?`. | Extension |
| `packages/hub-core/src/index/parse-handlers.ts` | Match type+source | Pass seat into match | Extension |
| `packages/contracts/src/flow/apply-bundle.ts` | No `personas`. Extra keys **stripped**. | Optional `personas` or apply **drops** the file | Extension — required |
| `packages/contracts/src/entities/space-index.ts` | No `personas` resource | Add resource + `ApplyIndexChange` | Extension |
| `packages/cli/src/lib/space-directory.ts` | No `personas.yaml` | Optional file → empty default | Extension |
| `packages/hub-core/src/index/apply-index.ts` | Known resources only | Diff personas; `replaceSpaceIndex` must DELETE+INSERT them | Extension |
| `packages/hub-core/src/index/validate-handler-bindings.ts` | Step aliases + view_resolver | Natural home for `PERSONA_HANDLER_UNSCOPED` | Extension |
| `packages/hub-core/src/index/handler-catalog-lint.ts` | Coverage for step handlers | **Must not** demand `step.opened` on a `meeting:` step | Watch |
| `packages/hub-core/src/index/validate-handler-placeholders.ts` | Prompt `{{…}}` allowlist | Only if meeting prompts get new keys | Skip v1 |
| `packages/hub-persistence` migrate / sqlite / memory / port | No `space_personas` | Mirror `space_events`. Both backends same PR | Extension |
| `packages/cli/src/lib/space-scaffold.ts` + `templates/space/manifest.json` | Exact file set in tests | Optional empty `personas.yaml` | Optional — don’t require |
| `packages/cli/src/lib/space-doctor.ts` | No personas | Optional uniqueness / scoping | Don’t require the file |
| `packages/contracts/src/entities/event-declaration.ts` | `events.yaml` | **Do not** require `mrmr.meeting.*` | Leave |

---

## 3. Flow facet

| Path | Today | Change | Kind |
|------|--------|--------|------|
| `packages/contracts/src/flow/manifest.ts` `FlowStepSchema` | `.strict()` — `meeting:` → `INVALID_FLOW_MANIFEST` | Optional `meeting` object | Extension |
| `packages/contracts/src/entities/step-contract.ts` | Nested steps also `.strict()` | Nested `meeting:` **reject** (O4). Don’t put meeting at flow root | Extension |
| `packages/hub-core/src/index/parse-flow-manifest.ts` | `rejectRemovedFields` | `meeting` is **not** a removed key | Extension |
| `packages/hub-core/src/flow-engine/step-contract-compile.ts` | Drops unknown | **Persist facet** on `StepContractCatalogEntry` or open has nothing | Hotspot |
| `packages/hub-core/src/flow-engine/compile.ts` | IR kinds: step_contract / parallel / start_flow | **No** new IR kind. Carry meeting on catalog | Do not grow IR |
| `packages/hub-core/src/flow-engine/step-open.ts` | Optional `step.opened` | Facet → convene on **this** `session_id` | Hotspot |
| `packages/hub-core/src/flow-engine/step-resolve.ts` | Only `resolveFlowStep` | Engine calls this on `closed` | Hotspot |

---

## 4. Emit + dispatch

| Path | Today | Change | Kind |
|------|--------|--------|------|
| `packages/hub-daemon/src/routes.ts` POST events | No journal, fake `seq: 1`, no `event:emit`, no `session_id` | Adapter to journal-first emit. Meeting types require `session_id` | Hotspot |
| `packages/hub-daemon/src/mcp-handlers.ts` | POST body: type, id, payload | Forward `session_id` for meeting types | Hotspot |
| `packages/hub-core/src/events/emittable-catalog.ts` | Listener-derived | Platform `said` / `closed` for roster + `event:emit` | Hotspot |
| `packages/hub-daemon/src/mcp-tool-schemas.ts` | Dynamic emit `oneOf` | Meeting branch; don’t break catalog branches | Extension |
| `packages/hub-core/src/hooks/dispatch.ts` | Always `createSession` | R1 split. `eventExecContext` must **not** spread `said.text` | Hotspot |
| `packages/hub-daemon/src/hook-dispatch.ts` | Thin adapter | Pass meeting session; don’t invent one | Follows core |
| `packages/hub-core/src/hooks/matcher.ts` | Legacy type+source | **Do not** overload for `participant` | Leave |
| `packages/hub-daemon/src/trigger-dispatcher.ts` | Retired, still invoked on POST events | **Do not** hang meetings here | Do not touch |
| `packages/hub-core/src/run/service.ts` `createSession` | Always new ULID | **Callers** attach. Do not add roster to insert | Do not change |
| `packages/hub-core` `ensureSessionAndRun` | Creates session if `session_id` missing | Attach path **must** pass ids — never hit this fallback | Watch |
| `packages/contracts/src/journal/event-types.ts` | No `mrmr.meeting.*` | Add five types | Extension |
| `packages/hub-core/src/journal/append.ts` | 64 KiB inline | Reuse for `said.text` — no second cap | Reuse |
| `packages/hub-core/src/journal/query.ts` | Space filter, time `since` | Transcript is a **new** session API | Do not wrap |

---

## 5. Assignments / prompt

| Path | Today | Change | Kind |
|------|--------|--------|------|
| `packages/hub-daemon/src/mcp-session-registry.ts` | Per **space** | Reachability only. Live map is `(session_id, participant_id)` | Hotspot |
| `packages/hub-daemon/src/control-bus.ts` | `invoke_action` = new work | New notify method assignment-mode does **not** drop | Hotspot |
| `packages/hub-daemon/src/invoke-service.ts` | Mint `step:resolve`; ensure session if missing | First join: invoke on existing `ses_*`. Later: skip invoke if live. Seat token ≠ `step:resolve` on `decide` | Hotspot |
| `packages/hub-daemon/src/wake-prompt.ts` | Full params JSON as **Data** | Meeting: trigger ids + `since_seq` only | Hotspot |
| `packages/hub-core/src/flow-engine/step-contract-slice.ts` | Orders `resolve_step` | **New** `murrmure.meeting/v1` renderer. Do not reuse | New sibling |
| `packages/executors/src/invoke-shell-prompt.ts` | Same operating rule | Meeting branch | Parallel helper |
| `packages/mcp-bridge/src/main.ts` + `wake-relay.ts` | Assignment-mode drops hook wakes; `pending-wake.json` local-only | New notify; don’t teach `get_pending_wake` | Hotspot |
| `packages/hub-persistence` `findRunByIdempotencyKey` | Per `event_id` | Do **not** use as join-once. Each `said` has a new `event_id` | Watch |
| `packages/contracts/src/ids.ts` | No `ptc_` / `msg_` | Add both | Extension |

---

## 6. Artifacts / shell / CLI / MCP

| Path | Change | Kind |
|------|--------|------|
| `packages/hub-core/src/artifacts/acl.ts` | **Do not** rewrite match rules. Expand readers at `said` accept to roster `spc_*` | Plug-in at emit |
| `packages/hub-persistence` port | Add `updateArtifactAuthorizedReaders` (no public ACL editor) | Extension |
| `packages/shell-web/src/routes/SessionPage.tsx` | Undo canvas-only return. Transcript tab stays | Hotspot |
| `packages/shell-web/src/hooks/useStepCanvasBinding.tsx` | Canvas + Transcript coexist | Hotspot |
| `packages/shell-web/src/components/ViewCanvasHost.tsx` | **Not** the chat | Do not use |
| `packages/shell-web/src/components/SharedFlowPage.tsx` | Transcript tab, default when convened | Extension if gated |
| `packages/shell-web/src/providers/JournalProvider.tsx` | Do **not** invalidate Needs-you on every `said` | Filter |
| `packages/shell-web/src/App.tsx` | **No** `/meetings` / `/chat` | Do not add |
| `packages/shell-client` | `transcript` + `closeMeeting` | Extension |
| `packages/cli/src/commands/root.ts` | `meeting` subcommand | Extension |
| `packages/hub-daemon/src/mcp-tool-registry.ts` + schemas + handlers | Three tools. **`catalog-schema.test.ts` `PLATFORM_TOOL_NAMES` is the name lock** (docs-proof does not assert the full list) | Extension |
| `packages/hub-core/src/projections/notifications.ts` | Optional human-chair close only. Never `said` | Watch |

---

## 7. Do not touch

| Path | Why |
|------|-----|
| `packages/hub-core/src/cross-space/query.ts` + `/v1/spaces/:id/queries/ask` | Typed RPC. Not talk. |
| `packages/view-sdk/**` | Chat is not a View. |
| `packages/hub-core/src/orchestration/attach.ts` | Binds a **flow graph**. |
| `packages/hub-core/src/gates/service.ts` / `GatePanel` | Room is not a gate. |
| `packages/hub-core/src/bridge/wait-condition.ts` / `POST …/waits` | Not `wait:`. |
| `packages/hub-daemon/src/trigger-dispatcher.ts` | Retired action wire. |
| `packages/runtime-kernel` | Kernel stays noun-free. |
| `createSession` implementation | Callers attach. |
| `packages/cli/templates/space/flows/hello-gate/**` | Don’t overload. |
| Tutorial 1a | New tutorial in slice 8. |
| Repo `.mrmr/` | Not the demo. |
| `Mcp-Session-Id` handshake | Different noun from `ses_*`. |

---

## 8. Schema reject vs strip

| Schema | Today | Needed |
|--------|--------|--------|
| `FlowStepSchema` `.strict()` | `meeting:` **rejected** | Add typed `meeting` |
| `StepContractManifestStepSchema` `.strict()` | Nested `meeting:` rejected | Keep reject (O4) |
| `HandlerEventFilterSchema` not strict | `participant` **stripped** | Add field + match + apply rule |
| `ExecutorHandlerSpecSchema` `.strict()` | Extra **handler-root** keys rejected. Nested `on.event.participant` is **not** this reject | Don’t put `participant` at handler root |
| `SpaceApplyBundleSchema` | Extra `personas` **stripped** | Add optional field |
| `JOURNAL_EVENT_TYPES` | Const miss; journal `type` is still `z.string()` | Add consts |
| `MURRMURE_DENIAL_CODES` | No `MEETING_*` / `PERSONA_*` | Add (or keep open `code`) |
