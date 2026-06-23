# Studio CLI

## `studio capability` (CDK)

Run from the capability package directory unless noted.

| Command | Purpose |
|---------|---------|
| `init <id> [--dir path] [--from-example name] [--with-skill]` | Scaffold new package |
| `validate .` | Local manifest/contract/MCP checks |
| `build .` | Stage bundle + compile server/UI |
| `push --space <spc>` | Upload to hub → `draft` |
| `status .` | Read `.studio/.../.push-state.json` |
| `list --space <spc>` | Installs in space |
| `validate --space <spc> --install <ins>` | Hub Lens A |
| `test --space <spc> --install <ins>` | Contract tests |
| `promote --space <spc> --install <ins>` | Approve for space |
| `apply --space <spc> --install <ins>` | Mount worker + MCP catalog |
| `rollback --space <spc> --install <ins>` | Roll back live mount |
| `dev . --space <spc> [--auto-apply]` | Watch loop |
| `dev . --sim [--port N]` | Offline simulator |
| `doctor` | Hub URL + token smoke check |

Add `--json` for machine-readable output.

### Environment

| Variable | Used for |
|----------|----------|
| `STUDIO_HUB_URL` | Hub base (default `http://127.0.0.1:8787`) |
| `STUDIO_TOKEN` / `STUDIO_HUB_TOKEN` | Bearer token |
| `STUDIO_SPACE_ID` | Default space in MCP/snippets |

### Push output (save these)

```json
{
  "install_id": "ins_…",
  "bundle_digest": "sha256:…",
  "next_steps": ["validate", "test", "promote", "apply"]
}
```

## `studio skill`

Install or refresh the agent skill in the current repo:

```bash
studio skill install          # → .cursor/skills/studio-capability/
studio skill update           # same, overwrite with latest package copy
studio skill version --json
studio skill install --dir /path/to/repo
```

Run from the **git root** (or capability monorepo root) so all agents in the project pick up the skill.

## Platform CLI (`@studio/hub-cli`)

Blocking helpers for scripts — `studio-hub-cli wait`, `transition`, etc. Agents in Cursor should prefer **MCP** over raw CLI.

## Hub daemon

```bash
pnpm --filter @studio/hub-daemon dev    # :8787
pnpm --filter @studio/shell-web dev     # shell UI
```
