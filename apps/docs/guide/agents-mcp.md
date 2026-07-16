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
`tutorial-builder/v1` profile contains exactly:

- `space:read`
- `flow:read`
- `flow:run`
- `step:resolve`

It is space-wide, so flows applied later work without replacing the connection.
Raw journal access is an advanced permission and is not in this profile.

## Generated MCP shape

Local configuration contains the stable launcher and IDs only:

```json
{
  "mcpServers": {
    "murrmure": {
      "command": "~/.murrmure/bin/murrmure-mcp",
      "args": [
        "--hub",
        "http://127.0.0.1:8787",
        "--connection",
        "con_…"
      ]
    }
  }
}
```

No token belongs in MCP JSON, project files, shell exports, logs, or command
arguments. The launcher resolves the current Desktop bundle at invocation; the
bridge then reads the credential from Keychain. Relaunch Desktop after moving
or upgrading it so discovery and the launcher refresh.

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

Advanced restricted creation may use `--flow-acl` with canonical flow IDs that
are already applied to the space. Unknown, future, or stale aliases fail.

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
`reference/mcp.md`.
