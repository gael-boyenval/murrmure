# Memory integration — Hub wire bridge

**Status:** normative — MVP v0.1 (§1–§10 only; appendices are non-normative pilot examples)
**Meeting:** `ses_01M0YMGF69D5MQWWA53HWWHQQD`  
**Binds:** [cross-space/spec.md](../cross-space/spec.md) · [handlers.md](handlers.md) · [grants-migration.md](grants-migration.md)

Murrmure integrates **external memory MCP** beside the journal. Hub owns grants, handler wiring, assignment-time reflect, and apply validation — not domain ontology or extract/fuse/consolidate logic.

Memory engine contract: see memory-space `specs/integration/murrmure.md` (engine-owned ontology). **Hub implementable wire:** [memory-hub-slice-1.md](memory-hub-slice-1.md) (spawn recipe, MCP schemas, grants persist, handler fields, reflect algorithm).

### MVP scope (normative)

| In MVP | Deferred (tighten when pain appears) |
|--------|----------------------------------------|
| Co-start memory MCP with desktop app | Strict export cross-check at apply |
| Bank per space; Hub brokers recall/retain/reflect/recent/retire | Hard-fail on unknown tags at apply |
| Own-bank read open; cross-bank **memory bank grant** + discovery | Per-connection tag grant filtering |
| Explicit writes only; journal never auto-retained | Per-desk tag/subject presets in bridge |
| Three access paths (§1); optional handler auto-reflect | Consumer-tier grants (v0.2) |

Spaces experiment with tags/subjects locally. Bridge prescribes wire only; appendices below are **pilot examples**, not required floors.

---

## 1. Architecture

| Layer | Owns |
|-------|------|
| **Memory MCP** | `retain` / `recall` / `reflect` / `recent` / `retire`; banks; subjects handbook. Consolidate = post-retain background job + CLI (not a normative Hub tool). |
| **Hub** | grant proxy; glob→literal tag expansion; bank validation; optional handler auto-reflect; co-start + pre-warm |
| **Spaces** | banks, `memory-tags.yaml`, `subjects.yaml`, `memory_exports`, explicit retain scripts |
| **Git** | full canon / skill / spec bodies |
| **Memory banks** | synthesized outcomes + pointers only — **never** full markdown/skill bodies |

**Git vs memory (MVP):** retains must carry git path entity refs (repo-relative path + optional heading anchor); synthesis in memory is a slice/summary, not a copy of repo bodies. Space-side eval gates enforce this; Hub does not parse retain payloads. Canon moves → re-retain/consolidate policy is desk-owned.

**Reads:** `reflect` at `step.opened` (assignment-prompt), tag-scoped, synthesis injected into handler prompt — not raw MCP JSON.

**Writes:** explicit `retain` from gate scripts (sprint-close, crit, meeting close, post-apply) — **never** auto from journal or `resolve_step`.

### Memory access paths (handler not required)

| Path | When | Handler YAML? |
|------|------|-----------------|
| **Agent MCP** | Agent calls `recall` / `retain` mid-session via Hub bridge | No — grants + bank/tag params only |
| **Gate script** | Sprint-close, meeting-close, post-apply retain scripts | No — event-bound script, not handler fields |
| **Auto reflect** | Hub pre-spawns synthesis into assignment prompt | **Optional** — only when handler already exists for spawn |

Handler `memory_tags` / `memory_reflect` configure path 3 only. They are **not** a prerequisite to use memory MCP.

### Wire reality (engine MVP)

**Shipped MCP tools today:** `retain`, `recall`, `reflect`, `recent`, `retire` — **`bank` required**. Engine fields on the wire: `tags` (retain `string[]`, reads `TagFilter`), `subjects`, `factTypes`, `includeBasedOn`.

**Bridge MVP (a):** Hub enforces bank. Own-bank reads succeed. Cross-bank **reads** require an explicit Space→bank memory bank grant (read-only). `murrmure_list_memory_banks` returns only the caller’s own bank plus granted foreign banks. Ungranted / unknown banks fail closed (`MEMORY_GRANT_DENIED` / `MEMORY_BANK_UNKNOWN`). Cross-bank `retain` / `retire` are denied even when a read grant exists. Agents pass `tags` / `subjects` / `factTypes` on the Murrmure tools. Handler `memory_tags` still configure auto-reflect only.

Engine backlog owned in memory-space `specs/integration/murrmure.md`.

---

## 2. Handler schema (apply-visible)

Optional fields on handler entries in `.mrmr/space/handlers.yaml` (path 3 — auto reflect only):

```yaml
memory_bank: kb                    # defaults to caller space bank id
memory_tags: [agent-substrate]       # read scope for primary reflect
memory_reflect_query: "…"          # optional question override (see hub-slice-1 §7)
memory_required: false             # fail spawn when MCP down + memory fields set
memory_reflect:                      # optional cross-bank reflects (sequential)
  - bank: doctrine
    tags: [doctrine:skill, doctrine:workflow]
    limit: 10                        # optional per entry; default 20
```

Rules:

- Memory fields are **executor-handler only** — rejected on `view_resolver` entries at apply.
- `consumer_space` — Hub substitutes **caller space id** at reflect invoke (single consumer). Do not put raw space ids in handler YAML.
- Flow-resolved patterns allowed: `catalog:{{input.slug}}`, `topic:{{input.slug}}` — slug charset `[a-z0-9-]`; apply validates pattern + allowlist; Hub **re-resolves tag against grant at invoke**.
- `memory_bank` must match `memory_bank` declared in `space.yaml`.
- Phase 1 handlers without `memory_reflect` apply clean; phase 2 adding `memory_reflect` requires memory MCP in connection + target-bank read grant.

---

## 3. Space directory files

| File | Validates |
|------|-----------|
| `space.yaml` `memory_bank` | bank id aligned with MCP `bank` param |
| `space.yaml` `memory_exports` | outbound tag grants `{ space, tags[] }` |
| `space.yaml` `memory_readers` | spaces granted read-only access to this space’s `memory_bank` (apply upserts / revokes grant rows) |
| `memory-tags.yaml` | optional read tag allowlist (globs expanded **Hub-side** to literals for grant checks); MVP: apply **warns** on unknown handler tags |
| `subjects.yaml` | optional retain subjects — **one handbook per MCP process** (union across banks on shared sqlite); experimental per desk |

**Own-bank reads:** owning space may recall/retain any row in its bank without cross-bank grant (tag filter optional on read).

**Own-bank writes:** `memory:write` on caller's bank — no export grant required for local retains.

Apply tolerates missing `memory_bank` until a handler declares memory fields or first retain script ships.

**Cross-bank reads** require a persistable **memory bank grant** `(reader_space_id, target_bank)` — distinct from connection `memory:read`. Apply `memory_readers` or `POST /v1/spaces/{id}/memory-bank-grants`. Grants resolve by bank string; operators should keep one live space per `memory_bank` (shared engine sqlite makes collisions dangerous). Hub does not encode bank names into capability strings.

**Export cross-check (deferred):** `memory_exports` tag handshake is not enforced in this slice.

---

## 4. Grants

Extend capability migrate with:

| Capability | Use |
|------------|-----|
| `memory:read` | gates tool access; **bank + tag scope** live in applied space index + connection inbound rows — bridge proxy requires both |
| `memory:write` | retain; bank + tag subset enforced on bridge proxy |

`GrantSchema` has no resource param — bank/tag scope is **not** encoded in capability strings. Hub reads scope from space directory + inbound grant manifest at bridge time.

Cross-bank reflect checks target bank + tag prefix like `query_ask` checks target space.

**Memory bank grants:** persist `(grant_id, reader_space_id, target_bank, owner_space_id, status)`. Unique active `(reader_space_id, target_bank)`. HTTP `POST/GET/DELETE /v1/spaces/{id}/memory-bank-grants`. Discovery: `murrmure_list_memory_banks` (`memory:read`) returns only banks the caller may read.

```yaml
memory_bank: doctrine
memory_readers:
  - spc_01KYSGYPYDBWZ0D11SX8JJ854V
```

Hub journals `mrmr.memory.bank_granted` / `bank_revoked` / `bank_accessed` with caller space, target bank, decision, tool, capability, grant id — **never** Memory contents. Hub does not parse retain payloads.

---

## 5. Assignment-prompt reflect

Before `shell_spawn`, when handler declares `memory_tags` and/or `memory_reflect`:

1. Build query from step id + `contract_keys` + handler `memory_reflect_query` when declared (persona `requests`/`asks` shape: `{ question, consumer_space, enough }`; Hub fills `consumer_space` from invoke).
2. Inject `space_digest`, installed skill VERSIONs, `git_branch`, run id when present.
3. Call reflect per bank (primary then `memory_reflect` list); concatenate synthesis blocks.
4. Inject **prose `answer` only** into prompt — never `basedOn` ids (debug: `MURRMURE_MEMORY_DEBUG=1` on hub-daemon logs only).

Defaults:

| Param | Value |
|-------|-------|
| `limit` | 20 (handler-overridable) |
| timeout | 15s steady; 30s first call per hub process (embedder cold start) |
| empty / timeout | inject nothing; do not block spawn |
| MCP unreachable + tags declared | inject nothing (MVP degrade); optional handler `memory_required: true` fails spawn with `MEMORY_MCP_UNAVAILABLE` |

Hub requests reflect prose only — **`includeBasedOn` omitted** (fact ids never cross wire into prompts).

**Pre-warm:** on memory MCP catalog connect, fire-and-forget `recall({ bank, limit: 1 })`. Failures logged; never block hub boot.

**Consolidation ceiling:** unbounded model work per retain batch — desk/process owns when to run consolidate CLI; bridge does not schedule it.

---

## 6. Step contract retain slot (phase 2)

Steps **may** declare `memory_retain` when resolve-bound gates exist. Desks with git/skill cadence gates (e.g. print sprint-close) use **gate scripts** (path 2) in MVP — not required.

```yaml
memory_retain:
  subjects: [decision-log, findings-consolidation]
  tags: [app:dream-to-print, gate:sprint-close]
```

Hub injects into resolve env:

- `MURRMURE_MEMORY_RETAIN_SUBJECTS`
- `MURRMURE_MEMORY_RETAIN_TAGS`
- `MURRMURE_GIT_BRANCH` / `MURRMURE_GIT_COMMIT` (when available — commit may be null pre-commit; branch + sprint id sufficient)

Resolve script assembles paragraph and calls `retain` — Hub never auto-retains.

---

## 7. Meeting close handler

Handler on `mrmr.meeting.closed` (doctrine space example: `memory-meeting-close`):

Env:

- `MURRMURE_SESSION_ID`
- `MURRMURE_MEETING_UP_TO_SEQ`
- `MURRMURE_SESSION_SUBJECT`

Script pulls transcript or chair summary; retains with subject `meeting-decision`. Entity ref = session id, not inferred repo path. `consumer_roster:*` — Hub expands to roster space ids before retain (meeting-close only; distinct from reflect `consumer_space`).

### Close-retain template (meeting `ses_01M0YMGF69D5MQWWA53HWWHQQD`)

> Murrmure memory MVP: memory MCP co-starts with the app (separate sqlite, collocated locally). Hub brokers recall/retain/reflect — not platform tools. Bank per desk; own-bank read open; cross-bank opt-in via grants. Journal never auto-retained; session outcomes live in desk banks as synthesized paragraphs. Three access paths: agent MCP, gate scripts, optional handler auto-reflect. Bridge normative for wire only; desk tags/subjects experimental — tighten after pilots. Doctrine promotes stable cross-desk patterns; federation grants stay for scoped handoffs.

Post-apply: Hub emits `mrmr.space.applied` after successful `space apply --strict`; separate handler may retain `package-ref` rows (include skill VERSION / git commit in entity ref) — never on assignment resolve. Failed post-apply retain must surface in handler exit, not silent stale anchors.

---

## 8. MCP proxy (Hub-side only)

Memory tools are **not** platform tools. Hub invokes sibling memory MCP on behalf of assignment-prompt and bridge proxy.

Engine detail (signatures, bank model, tags vs subjects, consolidate): **memory-space** `specs/integration/murrmure.md`.

Hub adds: grant enforcement, pre-warm hook, timeout policy, synthesis injection — no duplicate tool schemas here.

---

## 9. Denial and warn codes

| Code | When | MVP |
|------|------|-----|
| `MEMORY_GRANT_DENIED` | ungranted foreign bank, or any foreign write; payload `{ capability, bank }` | fail at bridge |
| `MEMORY_BANK_UNKNOWN` | no `memory_bank` on caller for own-bank default, or requested bank is not owned by any active space | fail at bridge |
| `MEMORY_MCP_UNAVAILABLE` | tags declared + `memory_required: true` + MCP unreachable at spawn | fail at spawn |
| `MEMORY_BANK_MISMATCH` | handler bank ≠ space.yaml | apply fail |
| `MEMORY_TAG_UNKNOWN` | handler tag not in `memory-tags.yaml` | apply **warn** |
| `MEMORY_SUBJECT_UNKNOWN` | retain subject not in `subjects.yaml` | apply **warn** |
| `MEMORY_EXPORT_MISMATCH` | export stub ≠ inbound grant row | log warn (phase 2: apply fail) |

v0.2: cross-desk concern routing — see doctrine `docs/concern-taxonomy.md` (link only; memory-space `subjects.yaml` = reference impl).

---

## 10. Co-start (local DX)

Desktop app **co-starts** memory MCP with the hub (same session, pre-warm on connect). Still a separate process and sqlite file — not embedded in the journal DB. Production may split lifecycle later.

---

## Appendix — Pilot examples (non-normative)

> **Not required for apply or sign-off.** Desk sketches from meeting `ses_01M0YMGF69D5MQWWA53HWWHQQD`. Copy/adapt in your space; do not treat as mandated floors.

### A — KB desk (`bank: kb`) — example only

**Phase 1 pilot:** `memory_bank: kb` + MCP in connection + one `session-outcome` retain (ontology canon) via agent MCP — no handler memory fields, no cross-bank grants.

**Retain sources (KB desk rule):** canon + session stubs only; `notes/applied/**` never exported (one-way link).

**space.yaml (phase 1):**

```yaml
memory_bank: kb
# memory_exports — phase 2 when print signals + catalog slugs admitted in projects.yaml
```

**memory-tags.yaml starters:** `agent-substrate`, `session`, `topic:*`, `catalog:*`, `confidence:*`, `concern:*`, `direction:*`

**subjects.yaml starters:** `lib-finding`, `topic-cookbook`, `session-outcome`, `placement-decision`

**Phase 1:** pilot retain + eval only — no `memory_reflect` on handlers.

**Phase 2 handlers:**

```yaml
# meeting-default
memory_tags: [agent-substrate]
memory_reflect:
  - bank: doctrine
    tags: [doctrine:skill]

# research (when flow exists)
memory_tags: [catalog:{{input.slug}}, topic:{{input.slug}}]
```

**Witness chain (space-side, independent gates):**

1. `memory-eval: PASS|FAIL — rank=<n> fact=<id> entity=<git-path>` — fixed query text + top-k threshold; agent-MCP path for phase 1; fail triage: (1) path not verbatim in retain, (2) tag typo, (3) consolidate skipped, (4) wrong bank
2. wire reflect on meeting-default
3. `doctrine-seed: PASS anchors=3` (doctrine post-apply)
4. `doctrine-eval: PASS anchor=murrmure-agent#meeting-seat` — FAIL if synthesis dumps full SKILL body

**Pilot retain:** `topic:ontology-in-agentic-workflows` session — subjects `[session-outcome]`, tags `[session, topic:ontology-in-agentic-workflows, confidence:medium]`, git path entity ref, then `consolidate()`.

Discoverability mirror (link only, post-merge): KB `notes/canon/topics/murrmure-memory-integration.md` → this bridge path.

---

### B — Print-business desk (`bank: print-business`) — example only

**MVP pilot:** bank `print-business` + one sprint-close retain via **gate script** (MCP direct). No KB inbound grant required at print `space apply` v1 — export handshake informal until live slug request.

**space.yaml:** `memory_bank: print-business` — no `memory_exports` v1.

**memory-tags.yaml:** `app:dream-to-print`, `gate:sprint-close`, `gate:crit`

**subjects.yaml:** `decision-log`, `findings-consolidation`, `profile-honesty-delta`

**Inbound grant (phase 2):** KB bank catalog slugs — only when print requests a slug; not coupled to print apply v1.

**Outbound read:** doctrine bank only (`doctrine:*`).

**Wiring order (space-side):**

1. connection inbound grant row matching KB export
2. space artifacts + meeting-default doctrine reflect
3. PGlite sprint-close retain + `print-eval` witness
4. task-build reflect last

**Sprint-close retain:** one paragraph via gate script; review before second retain (stale-fact risk in fast sprints). Branch + sprint id if commit null.

**print-eval witness (example):** space-side gate; path is desk-defined — not normative.

**Phase 4 task-build block:**

```yaml
memory_bank: print-business
memory_tags: [app:dream-to-print]
memory_reflect:
  - bank: doctrine
    tags: [doctrine:skill, doctrine:workflow]
```

---

### C — Doctrine bank (`bank: doctrine`)

**subjects.yaml:** `principle`, `convention`, `skill-ref`, `workflow`, `package-ref`, `meeting-decision`, `directive-outcome`, `bridge-ref`

**memory-tags.yaml (reflect allowlist):** `doctrine:principle`, `doctrine:convention`, `doctrine:skill`, `doctrine:workflow`, `doctrine:package-ref` — glob `doctrine:*` still valid at apply

**space.yaml:**

```yaml
memory_bank: doctrine
memory_readers:  # example only — optional outbound read grant seed
  - spc_01KYSGYPYDBWZ0D11SX8JJ854V
  - spc_01M0PMVTPTGSVVS1F6K8QCQ8BN
```

**Write paths only:** `mrmr.meeting.closed` handler + post-`space apply --strict` emit + `directive.execute` completion — never assignment resolve.

- `directive-outcome` — tag `doctrine:convention` on directive handler complete
- `bridge-ref` — normative spec promotions (e.g. `studio-specs/current/bridges/*`); git path entity ref, synthesis not full body

**Reflect template:** persona `requests` → `{ question, consumer_space, enough }`; Hub fills consumer from invoke.

**package-ref seeds:** `murrmure-agent#meeting-seat`, `murrmure-agent#assignment`, `murrmure-developer#flow-authoring` — git paths in doctrine repo; reflect returns slice, not full skill body.

Doctrine repo stub (link only post-merge): `docs/memory-integration/v1.md` → this bridge path.

---

## Review

Seats post `spec-review: PASS` or `spec-review: CHANGES:` with bullets on v0.1. Author revises until all PASS; chair reviews merged `studio-specs/current/bridges/memory.md`.
