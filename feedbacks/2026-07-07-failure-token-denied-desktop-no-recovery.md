# Failure: Desktop dev `token_denied` on preview-review run with no in-app recovery

## Summary

During Desktop dev (`pnpm desktop:dev:hmr`), a preview-review flow run fails with `token_denied` (`Invalid or revoked token`). The packaged/dev shell offers no way to recover: the user cannot navigate to `/connect`, cannot mint or paste a grant from the UI, and cannot fix auth without quitting the app or opening browser devtools to manipulate local storage.

## Context

- **Repo / space:** `/spaces/spc_my_space`
- **Failure type:** `integration_failure`
- **Workflow:** Tutorial 1 — Local preview review (preview-review flow run)
- **Environment:** Murrmure Desktop dev shell (`pnpm desktop:dev:hmr`) — Electrobun window loading Vite HMR shell against local hub (`http://127.0.0.1:8787`)
- **Actor:** Desktop human running a flow from space home
- **Docs reference:** `apps/docs/guide/desktop.md` — Desktop users are told bootstrap token is auto-injected and `/connect` is contributor-debug only; no documented recovery path when stored token is invalid or revoked mid-session

## Evidence

**API / flow run error:**

```json
{
  "code": "token_denied",
  "message": "Invalid or revoked token"
}
```

**Observed UX gaps:**

- Flow run returns `token_denied`; no in-app prompt to re-authenticate or open grant/connect flow
- User cannot navigate arbitrary URLs inside the Desktop webview (e.g. `/connect` for token paste)
- No grant UI surfaced in the shell when auth fails
- Suggested fixes (logout, `/connect` paste) are not accessible in the packaged/dev shell
- Workarounds require quitting Desktop or using devtools to clear `murrmure_token` / `murrmure_hub_url` in local storage — not documented for end users and brittle in packaged builds

**Docs vs behavior:**

- `apps/docs/guide/desktop.md` states Desktop injects bootstrap token on first run and lands on `/spaces/new`; `/connect` is "contributor debugging only"
- When the stored token becomes invalid (revoked grant, hub reset, credential drift), docs do not describe a Desktop-native recovery path

## Murrmure improvement

1. **Detect `token_denied` globally in the shell** — intercept API 401/`token_denied` responses and show a dedicated recovery screen instead of opaque run failures.
2. **In-app re-auth for Desktop** — expose a first-class "Reconnect" or "Sign in again" action that either re-runs bootstrap grant validation or opens an embedded `/connect`-equivalent flow (token paste or `mrmr grant mint` handoff) without requiring URL bar navigation.
3. **Grant management in operator chrome** — minimal Desktop menu item (alongside Copy MCP config / Open data folder) to view connection status, clear stored token, and trigger re-bootstrap.
4. **Document the failure mode** — add a "Token expired or revoked" subsection to `apps/docs/guide/desktop.md` with the supported recovery steps inside Desktop (not only CLI `mrmr login` or devtools).
5. **Hub-side hint on run failure** — when a run fails with `token_denied`, return a structured error payload the shell can route to the recovery UI (deep link or `murrmure://` auth route).

## Source

- Event: `murrmure.feedback.failure`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYBPRRVZCFWV1CKFWTZMKNK`
- Run: `run_01KWYBPRS04309FTCXFVZ78WEQ`
- Docs: `apps/docs/guide/desktop.md`
