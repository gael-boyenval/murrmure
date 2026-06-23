# Dev loop and canvas reload protocol

**Status:** normative (2026-06-21)  
**Phase:** BC5 + BC5b (CDK-dev)

---

## Commands

Connected mode (pushes to real hub):

```bash
studio capability dev ./workflows/my-flow --space spc_ui_sandbox
```

Simulated mode (no hub required):

```bash
studio capability dev ./workflows/my-flow --sim --port 4310
```

---

## Connected loop (`dev --space`)

```
watch(user project src)
  → debounce 300ms
  → validate (fail fast, print errors)
  → build → stage
  → push (draft, idempotent same semver)
  → optional: apply if --auto-apply and prior live
  → signal canvas reload
```

---

## Simulated loop (`dev --sim`)

```
watch(user project src)
  → debounce 300ms
  → validate (fail fast, print errors)
  → build (local stage only)
  → restart thin local runtime
      - simulated shell host
      - simulated hub-fetch bridge
      - simulated Studio state machine
  → notify browser test clients
```

`dev --sim` is local-only and MUST NOT write install rows, blobs, or push state to hub-backed storage.

---

## Simulated runtime contract

The thin runtime MUST provide:

1. **Simulated shell**
   - hosts capability iframe-equivalent container
   - sends `{ type: "init", ctx }` and `{ type: "reload" }`
   - proxies `hub-fetch` / `hub-fetch-result` messages
2. **Simulated install FSM**
   - `draft → validated → tested → promoted → live`
3. **Simulated instance FSM**
   - contract-driven transitions
   - revision checks for transition/metadata updates
   - deterministic failure responses for invalid transitions

---

## Reload signaling

| Mode | Channel | Event |
|------|---------|-------|
| Connected | SSE (shell subscribed) | `capability.dev_reload` `{ package_id, version, bundle_digest }` |
| Connected + simulated | postMessage | shell → iframe `{ type: "reload" }` |
| Connected + simulated | Fallback | full iframe src refresh with cache-bust query |

Idempotent: same digest → no reload.

---

## Playwright integration

`studio capability init` scaffolds Playwright tests that target the simulated runtime.

- `npm run test:e2e` SHOULD pass using `dev --sim` only
- no hub daemon required for baseline UI + state transition tests
- scenario fixtures define install/instance initial states

---

## `~/.studio/hubs/shared.json` extension

```json
{
  "capabilityProjects": [
    { "package_id": "review-loop-lite", "source": "/Users/dev/workflows/review-loop-lite" }
  ]
}
```

`dev` without path resolves from registered project.

---

## Failure behavior

| Failure | Action |
|---------|--------|
| validate fail | Skip build/push/runtime restart; print `--json` errors |
| push fail (connected mode) | Keep last good live; notify |
| apply fail (connected mode) | Show LIVE_APPLY_FAILED; do not kill prior live |
| simulated state machine mismatch | Return deterministic API error payload for test assertions |

---

## Related

- [02-sdk.md](./02-sdk.md)
- [03-shell-host.md](./03-shell-host.md)
