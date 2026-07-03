# Part 2 — Apply and register hooks

## 1) Build view

```bash
cd murrmure/views/daily-brief
npm install && npm run build
cd ../../..
```

## 2) Hooks

`murrmure/hooks.yaml`:

```yaml
version: 1
hooks:
  brief_requested_wake:
    on:
      event:
        type: brief.requested
    do:
      - invoke:
          action: mcp_wake
          params:
            wake_label: handle_brief_requested
```

## 3) Apply

```bash
mrmr space link --path . --space spc_daily_brief
mrmr space apply --strict
```

Confirm hooks indexed in `mrmr space status`.

## Next

[Part 3 — Connect agent →](./03-connect-agent)
