# Federation bridge (rev-1 slice I)

Normative wire for cross-hub execution in Murrmure v2. Policy and queue live in `@murrmure/hub-core`; HTTP relay is daemon-only (ADR-12).

## Virtual remote space

Register a local space with a `remote_hub` binding (no local path):

```yaml
type: remote_hub
peer_hub_id: hub_company
remote_space_id: spc_backend
```

Actions on virtual spaces **must** use the `remote_hub` executor — no local `cd`.

CLI:

```bash
mrmr federation peer add --id hub_b --url http://localhost:PORT_B
mrmr space link --remote --peer hub_b --space spc_remote
```

## Remote invoke (§16b F3)

| Attempt | Backoff |
|---------|---------|
| 1 | immediate |
| 2 | 1s |
| 3 | 3s |
| fail | `EXECUTOR_UNAVAILABLE` + journal |

Preflight: peer `/v1/health` must succeed before dispatch.

## Cross-hub artifacts (§16b F2)

Pass `transfer_id` + digest in invoke params. Peer hub materializes via exchange store when authorized. Each hub GCs its local copy independently.

## Federation journal ingress

`POST /v1/federation/ingress` — dedup on `(source_hub_id, event_id)`.

## Session federation (§16b F1)

`session_id` is hub-local. Optional shared `subject` links cross-hub work. Federated steps appear in run graph with **Remote space** label.

## Optional A2A executor

`a2a` binding posts to an external HTTP task endpoint — adapter stub only, not normative Murrmure wire.

## HTTP ops

| Method | Path | Scope |
|--------|------|-------|
| GET | `/v1/ops/federation/status` | `space:admin` |
| GET | `/v1/ops/federation/peers` | `space:admin` |
| POST | `/v1/ops/federation/peers` | `space:admin` |
| POST | `/v1/federation/ingress` | `space:admin` |
| POST | `/v1/spaces/{id}/link/remote` | `space:write` |

## Denial codes

| Code | Meaning |
|------|---------|
| `TARGET_SPACE_UNREACHABLE` | Peer down or unknown (fail fast, J13) |
| `EXECUTOR_UNAVAILABLE` | Remote preflight/retry exhausted |
| `FEDERATION_PEER_UNKNOWN` | Peer not registered |
