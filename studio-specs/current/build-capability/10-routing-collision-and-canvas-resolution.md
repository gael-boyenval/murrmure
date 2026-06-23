# Routing collision and canvas resolution

**Status:** normative (2026-06-20)

---

## HTTP routes (`routes_prefix`)

| Rule | Enforcement |
|------|-------------|
| Format | Must match `/api/{segment}` — single segment v1 |
| Uniqueness | At most one **live** install per `(space_id, routes_prefix)` |
| Lens A | Block apply if collision |
| Error | `ROUTE_PREFIX_COLLISION` hint `{ existing_package_id }` |

Capability routes mount **under** prefix; worker receives stripped paths.

---

## Canvas routes (`ui.canvas_route`)

| Rule | Enforcement |
|------|-------------|
| Format | Must start with `/spaces/:spaceId/` |
| Params | `:spaceId` required; instance key param name declared in manifest |
| Uniqueness | Two live installs **may** share pattern if disjoint instance routing (e.g. different metadata discriminator) |
| Collision | Same pattern + same instance resolver → `CANVAS_ROUTE_COLLISION` at apply |

---

## Shell resolution

1. Match URL to registered patterns from live installs (longest match)
2. Resolve `:spaceId` from route → verify token space
3. Resolve instance key from param or `instanceId` alias route
4. Load `CapabilityCanvasHost` with `install_id`

Generic fallback: `/spaces/:spaceId/instances/:instanceId` always registered — reads manifest for iframe URL.

---

## Instance → canvas

```
GET instance → capability_install_id → live manifest
→ iframe src = /capabilities/{package_id}/{semver}/ui/shell.html?instance={id}
```

---

## Offline validate warnings

CDK warns when:

- `routes_prefix` matches another staged package locally
- `canvas_route` identical to another package without distinct `id`

---

## Related

- [05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md)
- [03-shell-host.md](./03-shell-host.md)
