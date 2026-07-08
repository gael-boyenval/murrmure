# Failure: Revoked agent grant persists in Desktop localStorage — bootstrap not re-injected after first launch

## Summary

After a user saves an agent grant via Desktop `/connect` or MCP paste, revoking that grant leaves the shell stuck on `token_denied`. The CLI (`mrmr whoami`) still succeeds with the hub bootstrap token (`tok_01JBOOTSTRAPTOKEN00000001`), but the Desktop webview keeps using the revoked grant from `localStorage`. Bootstrap session injection runs only once per window lifetime (`bootstrapped` flag in `main.ts`), so reload or warm relaunch does not restore the bootstrap token. Recovery requires a full cold quit (Cmd+Q) or manual `localStorage` cleanup.

## Context

- **Repo / space:** `/spaces/spc_my_space`
- **Failure type:** `integration_failure`
- **Component:** Murrmure Desktop (Electrobun shell) + bundled shell-web auth bootstrap
- **Environment:** Local hub sidecar; Desktop app with bundled shell
- **Repro sketch:**
  1. Launch Murrmure Desktop (bootstrap token injected on first `dom-ready`).
  2. Visit `/connect` (or paste an MCP grant) and save a minted agent grant to `localStorage`.
  3. Revoke that grant (`mrmr grant revoke` or admin action).
  4. Reload the Desktop window (or relaunch without cold quit).
  5. Shell API calls fail with `token_denied`; `mrmr whoami` with bootstrap token still works.

## Evidence

**Observed behavior (from event logs):**

- CLI `mrmr whoami` OK with `tok_01JBOOTSTRAPTOKEN00000001`.
- Desktop `localStorage` may retain a revoked grant from `/connect` or MCP paste.
- `main.ts` `bootstrapped` flag prevents re-injection on reload.
- User must Cmd+Q (cold restart) or manually clear `murrmure_token` / `murrmure_hub_url` in `localStorage`.

**Desktop injection runs once per window** — `apps/desktop/src/main.ts`:

```72:78:apps/desktop/src/main.ts
  let bootstrapped = false;
  window.webview.on("dom-ready", () => {
    if (bootstrapped) {
      return;
    }
    bootstrapped = true;
    window.webview.executeJavascript(injectionScript);
```

**Injection script overwrites `localStorage` only when it runs** — `apps/desktop/src/session.ts`:

```54:65:apps/desktop/src/session.ts
export function createSessionInjectionScript(token: string, hubUrl: string): string {
  const serializedToken = JSON.stringify(token);
  const serializedHubUrl = JSON.stringify(hubUrl.replace(/\/$/, ""));
  return `(() => {
  const token = ${serializedToken};
  const hubUrl = ${serializedHubUrl};
  localStorage.setItem("murrmure_token", token);
  localStorage.setItem("murrmure_hub_url", hubUrl);
  if (window.location.pathname === "/" || window.location.pathname === "/connect") {
    window.location.replace("/spaces/new");
  }
})();`;
}
```

**Hash-based bootstrap (first navigation only)** — `packages/shell-web/src/desktop-bootstrap.ts` reads `#murrmure-bootstrap=<token>` once at load, writes `localStorage`, then replaces the URL. After the hash is stripped, subsequent reloads have no bootstrap signal in the URL.

**Launch URL carries bootstrap hash** — `apps/desktop/src/runner.ts`:

```122:125:apps/desktop/src/runner.ts
export function bootstrapLaunchUrl(hubUrl: string, token: string): string {
  const base = hubUrl.replace(/\/$/, "");
  return `${base}/#murrmure-bootstrap=${encodeURIComponent(token)}`;
}
```

**`/connect` persists user-supplied grants** — `packages/shell-web/src/routes/ConnectPage.tsx` writes `murrmure_token` and `murrmure_hub_url` to `localStorage` on "Save & continue", which can replace the bootstrap token for the remainder of the window session and across reloads if bootstrap is not re-applied.

**Hub denial code:** `token_denied` (`packages/contracts/src/errors/denial.ts`, mapped in `packages/cli/src/lib/hub-request.ts`).

**Root cause:** Desktop auth state is split between (a) one-shot bootstrap injection at window creation and (b) durable `localStorage` that `/connect` can overwrite. Once a saved grant is revoked, reload/relaunch within the same process does not re-run bootstrap injection, so the shell keeps sending the stale token.

## Murrmure improvement

1. **Re-inject bootstrap on every `dom-ready` in bundled Desktop**, or at minimum on navigation to `/` and `/connect`, instead of gating on a process-lifetime `bootstrapped` flag. The injection script is idempotent and should safely overwrite a revoked grant.
2. **On `token_denied` from `whoami` / `me.get()`**, clear `murrmure_token` in bundled mode and fall back to bootstrap re-injection (or redirect through a fresh `bootstrapLaunchUrl`) rather than leaving the user in a broken shell.
3. **Bundled Desktop: treat bootstrap token as canonical** — hide or de-emphasize `/connect` grant paste for the sidecar-launched app, or label it clearly as "agent MCP grant" distinct from the desktop operator session so revoking an agent grant does not brick the shell.
4. **Cold-start recovery without Cmd+Q** — expose a "Reset desktop session" action (menu or settings) that clears `localStorage` auth keys and reloads with `#murrmure-bootstrap=…`.
5. **Add a Desktop or shell-web integration test** — simulate save grant → revoke → reload → assert bootstrap token is restored and API calls succeed.

## Source

- Event: `murrmure.feedback.failure`
- Emitter: `/spaces/spc_my_space`
- Session: `ses_01KWYBQX2PJZD3VCKXYRME7CEY`
- Run: `run_01KWYBQX2PZC38P8H5140HFBR3`
- Docs: `apps/desktop/src/main.ts`, `packages/shell-web/src/desktop-bootstrap.ts`
