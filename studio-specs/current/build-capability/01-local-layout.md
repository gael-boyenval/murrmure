# BC0 — Local layout (user machine)

Where capability artifacts live **outside** the Studio platform repo.

---

## Two locations

| Location | Role | Git? |
|----------|------|------|
| **User project** | Source — contract, UI src, server src, tests | Yes (team repo) |
| **`~/.studio/capabilities/`** | Built stage + hub cache mirror | No (local only) |

Hub blob store (SQLite + files under hub `dataDir`) holds **pushed** bundles after `evolution.draft.upsert`. Same machine dev may skip re-upload when digest unchanged.

---

## User project layout (canonical)

SDK `studio capability init` scaffolds:

```
{user-project}/
  workflows/
    {package_id}/
      package.json               # exact-pinned deps; includes @studio/capability-dev-kit
      capability.manifest.json
      studio.capability.yaml       # optional: display name, description
      contract/
        contract.json              # state machine v2
        config.schema.json         # install-time Configure fields
        mcp-tools.json             # tool schemas + HTTP route map
      ui/
        src/App.tsx
        src/mount.tsx
        src/components/error/
        # build output: ui/shell.html + ui/entry.js
      server/
        index.ts                   # exports mountRoutes(app, CapabilityServerContext)
      tests/
        contract/
          reachability.test.ts
        e2e/
          canvas.spec.ts           # Playwright against simulated shell/runtime
          harness/
            simulated-shell.ts
            simulated-studio-machine.ts
        integration/               # optional — hits local hub
```

**Rules:**

- `package_id` in manifest === directory name (kebab-case)
- **`contract_ref_id` not in author manifest** — hub assigns at ingest ([05-manifest-and-bundle-schema.md](./05-manifest-and-bundle-schema.md))
- Generated `package.json` uses exact version pins (no semver ranges) for SDK/dev-kit scaffold dependencies
- User owns all files under `ui/` and `server/`

### Monorepo (UX-10)

Multiple capabilities under one repo:

```
my-platform/
  workflows/
    review-loop-lite/
    feature-spec/
  package.json          # optional workspace root
```

Each leaf has its own manifest; `studio capability` commands run with `path` or `--dir`.

---

## Staging layout (`~/.studio/capabilities/`)

After `studio capability build`:

```
~/.studio/capabilities/
  {package_id}/
    {semver}/
      manifest.json              # resolved manifest (paths absolute → relative)
      contract.json
      config.schema.json
      ui/
        entry.js                 # ESM bundle
        assets/…
      server/
        mount.mjs                # bundled server mount
      bundle.digest              # sha256:… of tar.zst or directory hash
      bundle.tar.zst             # optional single artifact for push
      build.meta.json            # { built_at, sdk_version, source_path }
    latest -> {semver}           # symlink for local dev convenience
```

After `studio capability push` succeeds, hub writes:

```
{hub.dataDir}/blobs/capability/
  {bundle_digest}/
    … same inner layout …
```

Mount registry row points at `storage_uri` + semver + `routes_prefix`.

---

## Hub discovery file (unchanged)

Existing `~/.studio/hubs/shared.json` remains hub connection only — **not** capability source.

Optional extension (BC5):

```json
{
  "hubId": "…",
  "url": "http://127.0.0.1:8787",
  "defaultSpaceId": "spc_ui_sandbox",
  "capabilityProjects": [
    { "package_id": "review-loop", "source": "/Users/dev/my-workflows/workflows/review-loop" }
  ]
}
```

SDK reads this for `studio capability dev` default paths — **user-edited**, not platform-shipped.

---

## Config schema (install-time only)

Lives in user project `contract/config.schema.json`. Configure UI renders form from schema when editing capability install config — same as today, but schema travels **inside user bundle**, not hardcoded in shell.

Example fields:

```json
{
  "type": "object",
  "properties": {
    "production_gate_enabled": { "type": "boolean", "default": true },
    "required_approver_role": { "type": "string", "default": "product_lead" }
  }
}
```

---

## Migration note (implementation)

Reference capabilities live under `examples/capabilities/` and are copied via:

```bash
studio capability init review-loop --from-example review-loop
```

Example tarball hosted separately or shipped inside `@studio/capability-sdk/templates/` — **not** linked from `@murrmure/shell-web`.

---

## BC0 definition of done

- [ ] Documented schemas for manifest + contract + config.schema validated offline
- [ ] Staging directory created by `build` with stable digest
- [ ] No capability source files required under platform `packages/` for validate to pass
