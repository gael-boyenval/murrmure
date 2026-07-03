# Part 5 — Troubleshooting

| Symptom | Fix |
|---------|-----|
| Hook did not wake dev agent | `mrmr space apply --strict`; confirm `hooks.yaml` event name matches emit |
| Cross-space query denied | Check grant scopes + inbound allowlist on target space |
| Publish checkpoint stuck | Resolve with `{ disposition: "continue", output: {} }` |
| Flow missing in Desktop | `mrmr space status`; re-link path; apply again |

See [Troubleshooting](../../troubleshooting) and [Known gaps](../../known-gaps).
