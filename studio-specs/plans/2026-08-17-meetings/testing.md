# Meetings — testing strategy

**Status:** draft (hardening 2026-08-17)  
**Acceptance:** [spec.md](./spec.md) §17 · [shell-lens.md](./shell-lens.md) §6  
**Slice order:** [architecture.md](./architecture.md) §5

Insurance lives next to the code that can regress. Do not invent a new harness.

---

## 1. Pyramid

| Layer | Owns | Does not own |
|-------|------|----------------|
| **Unit** (`hub-core`, `contracts`) | Schemas, denials, persona parse, participant match, convene/said/close, transcript fold, meeting prompt, `meeting:` compile, attach vs create with fakes, join-once with `LiveAssignmentPort` | Real MCP handshake, SSE, shell layout |
| **Daemon HTTP** | Two-space apply + convene, emit, receipts, transcript GET, MCP catalog/call, flow open→convene, close→advance, artifact ACL | LLM, real `cursor agent` |
| **Golden fixtures** | Journal / transcript / denial shapes | Runtime |
| **CLI** | Bundle loads `personas.yaml`; `PERSONA_HANDLER_UNSCOPED`; `mrmr meeting start` fetch-mock | Live hub |
| **Shell jsdom** | Transcript default, no compose, Close, View does not unmount Transcript, no `/meetings` | Playwright |
| **docs-proof** | New tools in `mcp-tools.md`; fixture strict-apply; no `wait:`/`gate:` | Protocol correctness |

**Reuse:** `startHubTestFixtureAsync` / `createSpace` / `applySpaceBundle` / `bootstrapAuth` from `packages/hub-daemon/test/helpers/space-fixture.ts`. Do not copy older `startHubDaemon` roll-your-own files.

When promoted: each §17 / S6 row gets a Fixture + Test column in `current/acceptance.md`.

---

## 2. Characterization first (slice 0)

File: `packages/hub-core/test/unit/hooks/dispatch-event-handler.characterization.test.ts`

Pin **today** before the split:

| `test()` | Pin |
|----------|-----|
| `non-meeting event handler always createSession` | `brief.requested` → title `Handler {id}` |
| `dedupes by source\|event_id\|handler_id` | same `event_id` → `deduped`, one session |
| `invokeAction receives the created session_id` | |
| `journals mrmr.hook.delivered on the created session` | |
| `matchEventHandlers ignores participant today` | documents the strip |
| `legacy hook ensure_session path still createSession` | meetings must not ride `hooks.yaml` |

**Keep green after split:**

- `hub-daemon/test/http/events/event-handler-dispatch.test.ts` — session title `Handler brief-wake`
- `hub-daemon/test/http/mcp/emit-event.test.ts` — feedback still **creates** a session
- `hub-daemon/test/http/hooks/delivery.test.ts` / `dedup.test.ts`

Meeting tests prove the **other** branch. Never weaken these.

**Split shape (D2 / D18):** `resolveEventDeliveryTarget()` — create | attach | notify_live. **Forbidden** characterization-to-impl jump: `if (isMeetingEvent) attach else create` inside today’s `dispatchEventHandler`.

---

## 3. Proposed test files

IDs: **17.1–17.10** = spec §17; **17.2b** = multi-target; **S6.1–S6.7** = shell-lens §6.

### Contracts

| Path | Proves | Rows |
|------|--------|------|
| `packages/contracts/test/meetings-schema.test.ts` | ids, personas file, convene, `to` xor, `JOURNAL_EVENT_TYPES` + denials | 17.1, 17.4, 17.6, 17.7 |
| `packages/contracts/test/handler-event-participant.test.ts` | `participant` not stripped; executor `.strict()` otherwise | 17.2 |
| `packages/contracts/test/step-meeting-facet.test.ts` | step accepts `meeting:`; unknown keys fail | 17.10 |

### Hub-core

| Path | Proves | Rows |
|------|--------|------|
| `test/unit/index/personas-parse.test.ts` | parse; duplicate id; file optional | 17.7 |
| `test/unit/index/handlers-parse.test.ts` **extend** | match by type + participant; non-meeting unchanged | 17.2, 17.2b |
| `test/unit/index/validate-persona-handlers.test.ts` | `PERSONA_HANDLER_UNSCOPED`; `MEETING_HANDLER_COMPLETE_AUTO` | apply |
| `test/unit/index/apply-index.test.ts` **extend** | `bundle.personas` | 17.7 |
| `test/unit/meetings/convene.test.ts` | 3 `ptc_*`, 1 `ses_*`; denials | 17.1 |
| `test/unit/meetings/said.test.ts` | xor, speaker drop, `REPLY_UNKNOWN`, hub-stamped `from` | 17.2, 17.4 |
| `test/unit/meetings/close.test.ts` | chair; `MEETING_CLOSED` | 17.6 |
| `test/unit/meetings/transcript.test.ts` | fold meeting types only; `since_seq`; rebuildable | 17.2, S6.2 |
| `test/unit/meetings/assignment-prompt.test.ts` | `murrmure.meeting/v1`; no prior bodies; no `resolve_step` rule | 17.5 |
| `test/unit/hooks/dispatch-event-handler.test.ts` | meeting + `session_id` → `createSession` **not** called | 17.3 |
| `test/unit/meetings/join-once.test.ts` | fake `LiveAssignmentPort`; two `said` → one start, two notify | 17.3 |
| `test/unit/flow-engine/step-open-meeting.test.ts` | open convenes on **this** session | 17.10 |
| `test/unit/flow-engine/step-resolve-meeting.test.ts` | `closed` → engine resolve; next step | 17.10 |
| `test/unit/events/emittable-catalog.test.ts` **extend** | platform types without `events.yaml` | §11 |
| `test/unit/artifacts/meeting-acl.test.ts` | roster spaces on readers | S6.3 |
| `test/unit/index/parse-flow-manifest.test.ts` **extend** | `meeting:` not `INVALID_FLOW_MANIFEST`; still reject `wait:`/`gate:` | 17.10 |

### Daemon

`describe("http/meetings/...")` + `startHubTestFixtureAsync({ prefix: "meetings-…" })`.

| Path | Proves | Rows |
|------|--------|------|
| `http/meetings/convene.test.ts` | POST + MCP start; attach if `session_id` | 17.1 |
| `http/meetings/personas.test.ts` | ads only; same-space `space:read` | 17.7 |
| `http/meetings/said-dispatch.test.ts` | one target / multi-target; **contrast** orphan-session test | 17.2, 17.2b |
| `http/meetings/attach-session.test.ts` | two `said` → still one `ses_*`; missing id → `MEETING_SESSION_REQUIRED` | 17.3 |
| `http/meetings/transcript.test.ts` | GET + MCP; closed still 200 | S6.6 |
| `http/meetings/close.test.ts` | non-chair; human-chair HTTP | 17.6, S6.5 |
| `http/meetings/flow-step.test.ts` | `decide` open convenes; close → `implement` | 17.10 |
| `http/mcp/catalog-schema.test.ts` **edit** | add three tools to `PLATFORM_TOOL_NAMES` (exact `.toEqual`) | catalog |
| `http/mcp/meeting-tools.test.ts` | grants; `query_ask` unchanged | 17.8 |
| `http/mcp/emit-event.test.ts` | **do not rewrite** — keep create-session for feedback | 17.8 |
| `http/cross-space/xs0-policy.test.ts` | **leave** — meetings never hit `/queries/ask` | 17.8 |
| `http/spaces/apply.test.ts` **extend** | unscoped handler → 400, no partial index | apply |

**No** `http/cross-space/meetings-query.test.ts`.

### CLI / shell / docs

| Path | Proves |
|------|--------|
| `cli/test/space-apply.test.ts` **extend** | `personas.yaml` in bundle; strict unscoped fail |
| `cli/test/meetings-example.test.ts` | `assertStrictApply` both fixture trees |
| `cli/test/meeting-cli.test.ts` | fetch-mock `POST /v1/meetings` |
| `cli/test/help-contract.test.ts` | new leaf needs `Requires:` |
| `shell-web/src/routes/SessionPage.test.tsx` | Transcript default; View + Transcript tab; closed historical |
| `shell-web/src/components/MeetingTranscriptPane.test.tsx` | labels, receipts, artifact **link**, no textbox |
| `shell-web/src/App.test.tsx` | `/meetings` absent |
| `shell-client/test/meetings.test.ts` | transcript + close HTTP |
| `cli/test/docs-proof.test.ts` | fixtures; VS-9; tutorial fences only in slice 8 |

---

## 4. Fixture spaces

Two trees. Strict-apply both. Not repo `.mrmr/`.

```text
test-utils/spaces/meetings-app/
  .mrmr/space/space.yaml          # slug: meetings-app
  .mrmr/space/personas.yaml       # designer + qa
  .mrmr/space/handlers.yaml       # meeting-designer, meeting-qa; mcp_session; participant set
  .mrmr/flows/api-shape/flow.manifest.yaml
  # NO events.yaml for mrmr.meeting.*
  # NO view_resolver on decide

test-utils/spaces/meetings-research/
  .mrmr/space/space.yaml          # slug: meetings-research
  .mrmr/space/personas.yaml       # researcher
  .mrmr/space/handlers.yaml       # participant: researcher
```

Negative apply fixture: `studio-specs/current/fixtures/meetings/persona-handler-unscoped.json`.

Goldens (when promoting):

| File | Shape |
|------|--------|
| `fixtures/meetings/convene-two-spaces.json` | 3 `ptc_*`, 1 `ses_*` |
| `fixtures/meetings/said-one-target.json` | |
| `fixtures/meetings/said-multi-target.json` | 17.2b |
| `fixtures/meetings/transcript-projection.json` | journal → DTO |
| `fixtures/meetings/assignment-prompt.json` | forbidden prior bodies |
| `fixtures/meetings/denials.json` | one case per §15 |
| `fixtures/meetings/meeting-step-compile.json` | |
| `fixtures/meetings/persona-handler-unscoped.json` | apply 400 |

`minimal-mrmr` must **not** require `personas.yaml`.

---

## 5. Hard-to-test (no flaky harness)

| Behavior | How |
|----------|-----|
| Join-once | Port `LiveAssignmentPort` `{ findLive, start, notify, revoke }`. In-memory fake. Assert notify×2, start×1, `createSession`×0. |
| Attach | Spy `createSession`. Count `mrmr.session.created`. |
| No transcript in prompt | Pure string test. Fixture prior texts must not appear. |
| Shell default pane | Mock `ShellClient`. No real SSE. |
| Who woke | Fake `invokeAction` on `HookDispatchDeps`. Record handler id. **Not** `hasConnectedSession(spaceId)` (two personas, one space). |
| Receipts | Meeting dispatch **awaited** (do not copy fire-and-forget `.catch(() => undefined)`). |
| Dedup vs join-once | Same `event_id` → one wake. Two `event_id`s, live seat → two notifies, one assignment. |

Control bus today: `handshake_ack` / `tools_changed` / `invoke_action`. New method (e.g. `murrmure/control.meeting_said`) behind `MeetingNotifier`. One daemon test that `ControlBus.publish` saw `message_id` + `since_seq`. No real MCP client.

---

## 6. CI that will fail unless updated in the same PR

| Gate | Why |
|------|-----|
| `http/mcp/catalog-schema.test.ts` | exact `PLATFORM_TOOL_NAMES` — **this** is the MCP name lock, not docs-proof |
| `mcp-tool-registry.ts` + schemas + handlers | all three or 403 |
| `cli/test/help-contract.test.ts` | `Requires:` on new leaf |
| `StepContractManifestStepSchema` `.strict()` | `meeting:` → `INVALID_FLOW_MANIFEST` until flipped together |
| `HandlerEventFilterSchema` | `participant` stripped until added |
| `SpaceApplyBundleSchema` / `space-directory.ts` | no `personas.yaml` reader |
| `docs-proof` VS-9 / removal-matrix | `wait:` / `gate:` in manifests or guidance |
| `docs-proof` VS-8 | no `resolve_gate` as close |
| `check-known-gaps.mjs` | human vs skill-agent if a row is added |
| MCP emit body | today no `session_id` — meeting tests must add it without breaking feedback emit |

Phrase docs as “not a removed `wait:` / `gate:` **kind**” so `\bwait:\s` does not false-positive.

---

## 7. Do not test in v1

Crash resurrection · federation relay · compose happy path (assert **absence**) · memory · `query_ask` as talk · `Mcp-Session-Id` = `ses_*` · turn-taking · persona tokens · kernel meeting View · `/meetings` wizard · Playwright Desktop · Tutorial 1a rewrite · journal paste in SKILL.md beyond existing greps.

**17.8** is a standing regression from slice 1.

---

## 8. Tests vs slices

| Slice | Tests |
|------:|-------|
| 0 | characterization |
| 1 | personas parse/apply, 17.7 |
| 2 | attach + said denials; keep create-session tests |
| 3 | convene/said/close HTTP; 17.1–17.4, 17.6 |
| 4 | transcript + prompt; 17.5 |
| 5 | `join-once.test.ts` |
| 6 | SessionPage + pane; S6.* |
| 7 | flow-step compile/open/resolve; 17.10 |
| 8 | docs-proof tutorial fences |
