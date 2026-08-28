# Memory — Hub slice 1 (implementable wire)

**Status:** normative v0.2 — Hub implementation ticket  
**Meeting:** `ses_01M0YMGF69D5MQWWA53HWWHQQD`  
**Binds:** [memory.md](memory.md) · [engine-wire.md](engine-wire.md) · [grants-migration.md](grants-migration.md)

Hub policy + grants + handler apply + reflect injection. **Authoritative MCP wire:** [engine-wire.md](engine-wire.md) (vendored from memory-space). Co-start example: [connection-co-start.example.json](connection-co-start.example.json).

---

## 0. One sentence (agent path)

**Agents call Hub-proxied memory tools (`retain`, `recall`, `reflect`, …) on their Murrmure connection; they never spawn `memory-mcp` themselves.**

---

## 1. Co-start (Hub-owned)

| Item | Normative value |
|------|-----------------|
| Transport | stdio MCP only |
| Child count | **One** `memory-mcp` per sqlite file per hub-daemon |
| Sqlite default | `$MURRMURE_DATA_DIR/memory.db` |
| Spawn | `bunx memory-mcp --db <path> --profile serve` — see [engine-wire.md §1](engine-wire.md#1-process-and-wire-co-start) and [connection-co-start.example.json](connection-co-start.example.json) |
| Catalog ready | `initialize` + `tools/list` on memory stdio client |
| Pre-warm | fire-and-forget `recall({ bank, query: ".", limit: 1 })` after catalog ready |
| Crash | hub-daemon restarts child (backoff 1s→2s→4s, max 3/boot); then `MEMORY_MCP_UNAVAILABLE` |
| Subjects handbook | optional `--subjects <path>` on spawn; union path TBD per desk (phase 2) |

Hub **does not** import memory as a library.

---

## 2. Hub ↔ engine field map (phase 1)

Hub proxy forwards to sibling MCP with these mappings:

| Agent / assignment | Engine MCP |
|--------------------|------------|
| `retain.content` or gate `text` | `content` |
| gate `entity` / git path | `documentId` or `context` (desk script assembles; Hub opaque forward) |
| `recall.query` | `query` (**required** on wire) |
| assignment `question` / `memory_reflect_query` | `reflect.query` |
| `consumer_space`, `enough` | **not sent** to MCP |
| reflect prose for prompt | `answer` only — Hub omits `includeBasedOn` in MVP |

Errors: engine returns `{ "error": "…" }` + `isError: true`. Hub maps to `MEMORY_ENGINE_ERROR` or passthrough message.

Full schemas: [engine-wire.md §2](engine-wire.md#2-tool-contracts-authoritative-wire).

---

## 3. Agent catalog

| Tool | Capability | Notes |
|------|------------|-------|
| `recall` | `memory:read` | bare name, server namespace `memory` |
| `reflect` | `memory:read` | |
| `recent` | `memory:read` | proxied; slice 1 optional |
| `retain` | `memory:write` | |
| `retire` | `memory:write` | proxied; slice 1 optional |

- Merged into `/v1/mcp/catalog` when memory child connected — **not** `murrmure_*` platform tools.
- Same Murrmure connection token; filtered by `memory:read` / `memory:write`.
- **No** direct desk agent → memory MCP in MVP.

**§3 pushback resolved:** Hub catalog uses **bare engine names** (not `memory_recall` prefix). Namespace disambiguation = MCP server name `memory`.

---

## 4. Space directory (apply)

### Phase 1 required

```yaml
memory_bank: kb   # ^[a-z][a-z0-9-]{0,31}$ — maps 1:1 to MCP bank param
```

Required when handler memory fields exist or first retain script ships.

### Phase 2 deferred

`memory_exports`, `memory_readers`, `memory-tags.yaml`, cross-bank inbound grants, export cross-check.

`subjects.yaml` validate at apply only when Hub spawns with `--subjects` path configured.

---

## 5. Grants (persist)

Capabilities: `memory:read`, `memory:write` (add to `CAPABILITY_STRINGS`).

Inbound manifest on connection grant:

```yaml
memory:
  inbound:
    - bank: kb
      tags: []   # stored; unused on wire phase 1
```

Persist: `connection_grants.memory_inbound JSON` → `{ bank, tags[] }[]`.

Phase 1 cross-bank: bank match only → else `MEMORY_GRANT_DENIED`. Tag filter phase 2.

Default `local-tools/v1`: add memory caps when connection template includes `memory` row.

---

## 6. Handler schema

Executor handlers only (`view_resolver` rejects memory fields):

```yaml
memory_bank: kb
memory_tags: [agent-substrate]     # phase 2 Hub filter; stored at apply
memory_reflect_query: "…"          # Hub-only; folded into reflect query
memory_required: false             # spawn fail when MCP down
memory_reflect:                    # phase 2 cross-bank
  - bank: doctrine
    query: "…"                     # overrides default query for this bank
    limit: 10
```

Phase 1 pilots: **no** `memory_reflect` on handlers (KB, print-business). Gate scripts + agent MCP only.

---

## 7. Assignment reflect (Hub algorithm)

Phase 2 feature. When handler declares `memory_tags` / `memory_reflect`:

1. Build `query` = `Step {step_id} ({contract_keys})` + optional `memory_reflect_query`.
2. Append context lines (space_digest, skill VERSIONs, git_branch, run_id) into query string.
3. Call sibling `reflect({ bank, query, limit })` — **never** `includeBasedOn` in MVP.
4. Concatenate `answer` blocks with `\n\n---\n\n`.
5. Inject under `## Memory context` after `## Task`.
6. Timeout: 15s steady; **30s first reflect per MCP child connect** (embedder cold start).
7. `memory_required: true` + failure → `MEMORY_MCP_UNAVAILABLE`.

---

## 8. Slice 1 checklist

| # | Deliverable | Owner |
|---|-------------|-------|
| 1 | Co-start + child lifecycle | hub-daemon |
| 2 | Proxy bare tool names + field map §2 | hub-daemon + mcp-bridge |
| 3 | `memory:read`/`memory:write` + inbound persist | contracts + hub-daemon |
| 4 | `memory_bank` apply | contracts + hub-core |
| 5 | Denial codes [memory.md §9](memory.md#9-denial-and-warn-codes) | hub-daemon |

**Gate:** own-bank `retain` + `recall` via Hub proxy; phase 1 pilots do not require reflect.

---

## Review

Bundle: `memory.md` + this file + `engine-wire.md` + `connection-co-start.example.json`. Post `spec-review: PASS|CHANGES:`.
