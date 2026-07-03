# Federation (cross-hub)

Murrmure v2 supports **federation** between local hub instances. Policy and retry live in `@murrmure/hub-core`; HTTP relay is daemon-only.

## When to use

- Invoke actions on a **remote hub** without copying the whole space index locally
- Bind a **virtual space** that routes executor work to a peer hub
- Ingest federated journal events for cross-hub visibility

Murrmure Cloud is **not shipped** — federation is peer-to-peer between self-hosted hubs.

## Register a peer

```bash
mrmr federation peer add --id hub_company --url http://peer.example:8787 --token tok_peer_admin
mrmr federation status
```

HTTP: `POST /v1/ops/federation/peers` with `{ hub_id, url, auth_token? }`.

## Virtual remote space

Register a local space with a `remote_hub` binding (no local filesystem path):

```yaml
# murrmure/space.yaml + link/remote
type: remote_hub
peer_hub_id: hub_company
remote_space_id: spc_backend
```

CLI:

```bash
mrmr space link --remote --peer hub_company --space spc_remote
```

Actions on virtual spaces **must** use the `remote_hub` executor — no local `cd`.

## Cross-hub invoke

Remote dispatch retries with backoff (immediate → 1s → 3s). Preflight requires peer `GET /v1/health`. Failures journal `EXECUTOR_UNAVAILABLE`.

Pass artifacts via `transfer_id` + digest in invoke params; peer materializes when authorized.

## Federated run visibility

- `session_id` is hub-local; optional shared `subject` links cross-hub work
- Federated steps appear in run graph with **Remote space** label
- `POST /v1/federation/ingress` dedups on `(source_hub_id, event_id)`

## Agent guidance

- Prefer **`murrmure_invoke_action`** on virtual spaces over duplicating remote flows locally
- Use **`query_ask`** / `spec_summary@1` for cross-space reads (XS0), not federation ingress
- Do not assume `murrmure_list_sessions` spans peers — list is hub-local

## CLI quick reference

```bash
mrmr federation peer add --id hub_company --url http://peer.example:8787 --token tok_peer_admin
mrmr federation status
```

HTTP routes: `GET/POST /v1/ops/federation/peers`, `GET /v1/ops/federation/status`, `POST /v1/federation/ingress`, `POST /v1/spaces/{id}/link/remote`.
