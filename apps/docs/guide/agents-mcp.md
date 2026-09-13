# Connect local tools (MCP)

A Murrmure **connection** authorizes one machine or trust boundary. The same
connection can be installed in several local tools; it is not an agent identity.
Desktop bundles the MCP bridge, so local setup does not require a separate
bridge package.

## Recommended setup

Keep Desktop running, then finish `mrmr setup`. Accept **Connect tools on this
computer?**, select one or more detected integration contexts, reload them, and
call `murrmure_space_status`.

To add a connection later:

```bash
mrmr connection create --space spc_…
```

Creation automatically stores the credential in macOS Keychain, activates the
connection, installs the bundled bridge and agent skill through each selected
adapter, and saves one reload/resume step. The default
`local-tools/v1` profile contains exactly:

- `space:read`
- `flow:read`
- `flow:run`
- `step:resolve`

It is space-wide, so flows applied later work without replacing the connection.
Raw journal access is an advanced permission and is not in this profile.
`murrmure_get_artifact` is available through `space:read`; artifact ACL and
digest verification still gate each `xfr_*`, and the verified copy is written
only into the authenticated space's local inbox. Attach uses
`murrmure_put_artifact` (`blob:write`).

## Generated MCP shape

Local configuration pins the connection (space) and never embeds a Hub URL or
token:

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "~/.murrmure/bin/murrmure-mcp",
      "args": ["--connection", "con_…"]
    }
  }
}
```

The launcher resolves the current Desktop bundle at invocation; the bridge
resolves the Hub from discovery and the credential from Keychain for that
connection id. Prefer project-level `.cursor/mcp.json` when the workspace has
`.cursor/`. Relaunch Desktop after moving or upgrading it so discovery and the
launcher refresh.

Unknown tools use the generic adapter. It writes no tool configuration and
prints portable MCP/skill instructions using the same descriptor.

## Spawned handler assignments

The same installed descriptor is safe to use from a prompted local handler.
The Hub gives the child a short-lived run/step/handler credential and
`MURRMURE_ASSIGNMENT_SCOPE`. In that context the bundled bridge bypasses the
persistent Keychain connection and uses only assignment authority. It fails
closed if the ephemeral token is absent.

The generated `murrmure.agent/v1` prompt contains complete branch calls with
live IDs. The child can resolve its assigned step, but cross-run, cross-step,
cross-space, expired, and revoked writes are denied. The credential is never
written to MCP config, prompt text, audit, or logs and is revoked when the
assignment terminates.

## Manage trust boundaries

Use a second connection for another computer, team member, CI runner, or
intentionally separate trust boundary:

```bash
mrmr connection list --space spc_…
mrmr connection activate con_… --space spc_…
mrmr connection rotate con_… --space spc_…
mrmr connection revoke con_… --space spc_…
```

Revoked entries remain Hub audit history; they cannot be reactivated. Rotation
creates a replacement identity and removes the old local credential.

### Custom capability grants

`mrmr connection create` always mints the fixed `local-tools/v1` set. To add
capabilities such as `event:emit` or `hub:admin` (directive fan-out MCP), use:

```bash
mrmr connection grant --space spc_…
```

In a TTY this opens a checklist of grantable capabilities (local-tools caps
pre-selected). Headless / `--json` mode requires an explicit list:

```bash
mrmr connection grant --space spc_… \
  --capabilities=space:read,flow:read,flow:run,step:resolve,event:emit,journal:read,blob:write,blob:read
```

When the selected set is not exactly `local-tools/v1`, the Hub mint omits that
profile so custom capabilities are stored. Reload local tools afterward so MCP
picks up the new active connection.

If project `.cursor/mcp.json` is missing `--connection`, run:

```bash
mrmr space doctor --fix
```

That rewrites to the launcher + `--connection <con_…>` for the linked space
(no Hub URL). Advanced restricted creation may use `--flow-acl` with canonical
flow IDs that are already applied to the space. Unknown, future, or stale
aliases fail.

## Plane MCP for spawned seats

Interactive Cursor can use Plane’s OAuth MCP URL. Headless spawned seats
cannot complete that browser flow. Participating spaces (`spc_murrmure` in
this repo) pin Plane’s **PAT** endpoint in **project-level**
`.cursor/mcp.json` only — do not add `plane` to `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "plane": {
      "url": "https://mcp.plane.so/http/api-key/mcp",
      "headers": {
        "Authorization": "Bearer ${env:PLANE_PAT}",
        "x-workspace-slug": "gbworks"
      }
    }
  }
}
```

Cursor interpolates `${env:PLANE_PAT}` at process start. The value is never
written into `mcp.json`, prompts, logs, or artifacts.

`PLANE_PAT` is hub-private. **GBD-29** loads it from the hub’s `.env.local`
(`chmod 600`, never committed). Spawn inherits hub `process.env`; do not add
`PLANE_PAT` to handler `invokeEnv`. After changing the env file, restart the
hub so new seats see it.

Seat handlers must pass `--approve-mcps` (already on meeting + directive
recipes here). After a `mcp.json` or token change, reload the MCP server or
start a **new** `cursor agent` — an already-open chat may keep the old tool
snapshot.

### Token lifecycle

1. In Plane, create a personal access token scoped to workspace **gbworks**.
2. Put it in the GBD-29 hub-private `.env.local` as `PLANE_PAT`. `chmod 600`.
   Do not export it in a tracked file or paste it into a prompt.
3. Restart the hub. Reload MCP, or spawn a new seat.
4. To revoke: revoke the PAT in Plane, replace `PLANE_PAT` in `.env.local`,
   restart the hub, and start a new agent.
5. Confirm no literal leaked: `rg -n 'PLANE_PAT='` and
   `rg -n 'Bearer [A-Za-z0-9]' .cursor/mcp.json` should show only the
   `${env:PLANE_PAT}` interpolation (and docs naming the variable).

### Operator preflight (not CI)

With a live hub that has `PLANE_PAT` loaded, spawn a seat and confirm it can
**read, comment on, and update** an authorized GB Delivery work item. Do not
call live Plane with a PAT from CI or commit the token.

## Headless CI

Headless CI is explicit and separate from local Desktop mode. Install
`@murrmure/mcp-bridge` on PATH, launch it with `--headless-ci`, and inject
`MURRMURE_HUB_TOKEN` from the CI provider secret manager at process runtime.
Never generate that token into files, arguments, or logs. Local mode does not
fall back to this environment variable.

## Verify and diagnose

After reload, call `murrmure_space_status`; `murrmure_resolve_step` must also be
present. Run `mrmr space doctor` to distinguish a missing launcher, stale
discovery, locked/missing credential, revoked or mismatched connection, and an
unreachable Hub.

See [MCP tools reference](../reference/mcp-tools) and the installed skill's
`reference/mcp.md`. Meeting walkthrough: [Tutorial 1b](./tutorials/02-meetings/).

## Meetings: one connection per space

`murrmure-mcp --connection con_…` is **one space**. Enabling the Murrmure server in
this workspace does not install tools in other linked spaces.

- Put that space's `--connection` in **that repo's** `.cursor/mcp.json`.
  Do not add `murrmure` to `~/.cursor/mcp.json` (user MCP). Same name, wrong
  space, Cursor shows two servers and disables one.
- Meeting seats start on convene (`shell_spawn` +
  `session.mode: persistent` + `continuation`). One interactive process stays
  alive until room close; later `said` writes the next turn into that PTY.
  Resume after close uses `--resume` of the minted chat id. You do not need a
  Cursor chat open. Copy the handler from
  [Meetings](./meetings.md#put-this-in-every-invited-space).
- To chair a room, call `murrmure_list_invitable_spaces` (no args) and pass
  discovered `space_id` values into `murrmure_start_meeting.participants`.
  Same-space `murrmure_list_personas` cannot list a foreign catalog. The
  directory is not `GET /v1/spaces` (`space:enter` sidebar) and does not
  include memory, artifacts, or local paths.
- Default `local-tools/v1` omits `event:emit`. Grant it before a seat can
  `murrmure_emit_event` `mrmr.meeting.said`.
- Attach a file with `murrmure_put_artifact({ content, name })`, emit
  `mrmr.meeting.said` with `artifacts: [xfr_*]`, then the peer resolves it with
  `murrmure_get_artifact({ transfer_id: "xfr_…" })`. The returned
  `artifact.local_path` is relative to that seat's space root.
- After grant, hub, or `mcp.json` changes, reload the MCP server in that
  window. The bridge refetches `/v1/mcp/catalog` on every `tools/list`. A live
  stdio process also watches handshake `server_tools` and discovery
  `pid`/`started_at` (Desktop HMR hub replace) and emits `tools/list_changed`.
  An already-open agent chat may still keep the tool snapshot from when that
  chat started — use a new chat to see newly granted tools.
  Cursor showing **0 tools** usually means it rejected `tools/list` — every
  tool `inputSchema` must have `type: "object"` (a bare `oneOf` is dropped).
  The hub catalog for a live connection is not empty.
