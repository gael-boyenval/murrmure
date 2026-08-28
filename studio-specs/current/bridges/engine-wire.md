# Memory engine ↔ Murrmure Hub — integration contract

**Status:** vendored from memory-space `specs/integration/murrmure.md` — engine-owned; do not edit here.  
**Meeting:** `ses_01M0YMGF69D5MQWWA53HWWHQQD`  
**Hub slice:** [memory-hub-slice-1.md](memory-hub-slice-1.md) · [memory.md](memory.md)

Binding record for Hub slice 1 (bank-only on the wire). Prose in `studio-specs/current/bridges/memory.md` is the product sketch; **this file is what the sibling MCP actually implements**.

**Version:** ships with package `memory` (`SERVER_VERSION` in MCP is `0.0.0` until release tagging).

---

## 1. Process and wire (co-start)

| Field | Value |
| --- | --- |
| Binary | `memory-mcp` (`package.json` bin → `src/mcp/index.ts`) |
| Invoker | `bunx memory-mcp` from the memory package root, or absolute path to the bin after install |
| argv | `--db <path>` **required**; `--profile <name>` optional (default `dev`); `--subjects <path>` optional |
| cwd | Memory package root (or any cwd — paths are absolute on `--db` and `--subjects`) |
| env | Read only through profile resolution in `src/config/env.ts` when profile uses real externals (`serve`, `live`). No Hub-specific env keys on the MCP process today |
| transport | **stdio** (`StdioServerTransport`) |
| MCP `serverInfo` | `{ name: "memory", version: "0.0.0" }` |
| SQLite | **One file, all banks.** `--db` is the file path. Banks are rows keyed by `bank_id`, not separate processes |
| Lifetime | Process stays alive until the client closes stdio. Misconfiguration fails at startup (stderr + exit 2). A running server does not exit on its own |
| Restart | Hub owns restart policy. On crash, spawn again with the same `--db`. No second-instance lock in the engine — two processes on one file is SQLite concurrent-read / one-writer; Hub should hold one MCP child per db file |
| “Catalog connected” | Hub may call `recall({ bank, query: ".", limit: 1 })` or `tools/list` after stdio handshake. No separate readiness tool |
| Auto-consolidate | MCP enables `autoConsolidate: true` (026). Retain returns before background consolidate finishes; errors log to stderr |

Profiles Hub should use:

| profile | store | externals | Hub use |
| --- | --- | --- | --- |
| `dev` | file | fixture | tests, offline |
| `serve` | file | real | **production co-start** — real extraction, file-backed |
| `live` | memory | real | in-memory only; not for persistent Hub bank |

Example co-start (Hub fills paths):

```json
{
  "command": "bunx",
  "args": ["memory-mcp", "--db", "/path/to/hub-memory.db", "--profile", "serve"],
  "cwd": "/path/to/memory-package"
}
```

Optional subjects handbook (028):

```json
{
  "args": ["memory-mcp", "--db", "…", "--profile", "serve", "--subjects", "/path/to/subjects.yaml"]
}
```

---

## 2. Tool contracts (authoritative wire)

Five tools. **Bare names** (`retain`, not `memory_retain`). MCP clients namespace by server name `memory`.

**Every tool requires `bank`** (string). Omitted `bank` is a schema error. Isolation is `WHERE bank_id = ?` in the store — not a grant list on this process.

**Tags are not on the MCP wire** (010). Tag scope is engine-internal / future Hub grant layer. **Subjects** appear only when the MCP process was started with `--subjects`; otherwise schemas omit `subjects` fields entirely.

Errors: validation and domain failures return **tool content** with `{ "error": "<message>" }` and `isError: true`, not JSON-RPC throws.

### `retain` (write)

| field | required | type | notes |
| --- | --- | --- | --- |
| `bank` | yes | string | bank id |
| `content` | yes | string | raw text; engine extracts facts |
| `context` | no | string | optional framing |
| `documentId` | no | string | revision anchor |
| `mentionedAt` | no | string | ISO-8601; defaults to now |
| `subjects` | if handbook loaded | string[] min 1 | retain: required when `--subjects`; names from handbook |

Success: `{ "status": "ok", "documentId": "doc_…", "facts": [{ "id", "text", "subjects" }], "ignoredSubjects"? }`

### `recall` (read-only)

| field | required | type |
| --- | --- | --- |
| `bank` | yes | string |
| `query` | yes | string |
| `limit` | no | positive int |
| `when` | no | `{ from, to }` ISO |
| `subjects` | no | string[] (tilt, not filter) |

Success: `{ "results": [{ "id", "bank", "text", "factType", "occurredAt", "proofCount", "subjects" }] }`

### `reflect` (read-only)

| field | required | type | notes |
| --- | --- | --- | --- |
| `bank` | yes | string | |
| `query` | yes | string | **not** `question` on the wire |
| `limit` | no | positive int | |
| `includeBasedOn` | no | boolean | when true, include evidence rows |
| `subjects` | no | string[] | tilt semantics as recall |

Success: `{ "answer": "prose or null", "basedOn"? }` — `basedOn` omitted unless `includeBasedOn: true`.

Hub field map: assignment `question` → MCP `query`; `consumer_space` / `enough` Hub-only.

### `recent` / `retire`

`recent`: `bank` required, `limit?` → `{ results: [...] }` (same shape as recall).

`retire`: `bank`, `id` required, `reason?` → `{ status: "retired"|"already-retired", id }`.

---

## 3. Agent path vs Hub proxy

**One sentence:** coding agents reach memory through **Hub-proxied MCP tools** on the Hub connection; they do not spawn `memory-mcp` themselves in MVP.

| surface | tools | connection |
| --- | --- | --- |
| Sibling MCP (stdio child) | bare `retain`, `recall`, `reflect`, `recent`, `retire` on server `memory` | Hub spawns one stdio child per sqlite file |
| Hub agent catalog | **same bare names**, merged into agent connection catalog when `memory:read`/`memory:write` granted | Hub bearer / desktop connection |
| Direct space → memory MCP | **Out of MVP** |

Memory tools are **not** Murrmure platform tools (`murrmure_*`).

---

## 4–9. Banks, grants, handlers, reflect, scope, checklist

See vendored source in memory-space `specs/integration/murrmure.md` §4–§9. Hub-owned items: grants persist, handler YAML apply, assignment reflect injection — specified in [memory-hub-slice-1.md](memory-hub-slice-1.md).
