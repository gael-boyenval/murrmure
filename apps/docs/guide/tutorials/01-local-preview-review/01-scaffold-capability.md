# Part 1 - Scaffold `preview-review` (strict React + split files)

Create a new custom capability from scratch using `@studio/capability-sdk`.
This version is intentionally modular: contract + MCP + server + React UI split into focused files.

## What you finish with

By the end of this part, you will have:

- A `preview-review` contract with a human <-> agent handoff loop
- Four MCP tools exposed by the capability
- A React canvas UI split into components and API/client utilities
- A reproducible build flow (`validate` + `build`) for local staging

## 1) Initialize the capability project

```bash
mkdir -p ~/work/preview-review-tutorial
cd ~/work/preview-review-tutorial
npm init -y
npm install -D @studio/capability-sdk

studio capability init preview-review --dir ./workflows/preview-review --install
cd ./workflows/preview-review
```

Why this step:

- `studio capability init` now scaffolds a strict React capability project
- the generated root `package.json` already includes exact-pinned SDK/dev-kit + React dependencies
- `--install` hydrates dependencies immediately so examples in this part run without extra setup

## 2) Define the contract state machine

Open `contract/contract.json` and update it in small blocks.

### 2.1 Identity + lifecycle

```json
{
  "schemaVersion": "2.0",
  "id": "preview-review",
  "version": "1.0.0",
  "initial_state": "pending_review",
  "terminal_states": ["resolved"]
}
```

Why this step: each new session starts waiting for a human, and only `resolved` is terminal.

### 2.2 Metadata needed by UI and agent

```json
"metadata_schema": {
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "preview_url": { "type": "string", "format": "uri" },
    "latest_comments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "author": { "type": "string" }
        }
      }
    }
  }
}
```

Why this step:

- `preview_url` drives the iframe target shown to reviewers
- `latest_comments` carries reviewer feedback into the next agent cycle

### 2.3 States + transitions

```json
"states": [
  { "id": "pending_review", "kind": "active" },
  { "id": "pending_agent", "kind": "active" },
  { "id": "resolved", "kind": "terminal" }
],
"transitions": [
  {
    "id": "human_request_changes",
    "from": "pending_review",
    "to": "pending_agent",
    "event": "request_changes",
    "actors": ["human:*"],
    "emit": ["review.changes_requested"]
  },
  {
    "id": "human_approve",
    "from": "pending_review",
    "to": "resolved",
    "event": "approve",
    "actors": ["human:*"],
    "emit": ["review.validated"]
  },
  {
    "id": "agent_signal_changes_applied",
    "from": "pending_agent",
    "to": "pending_review",
    "event": "changes_applied",
    "actors": ["agent:*"],
    "emit": ["review.round_ready"]
  }
]
```

Why this step: this gives you a strict turn-taking loop:

1. Human requests changes -> agent turn
2. Agent signals updates -> human turn
3. Human approves -> done

### 2.4 Event declarations

```json
"events": {
  "declarations": [
    { "type": "review.changes_requested", "schema": { "type": "object" } },
    { "type": "review.validated", "schema": { "type": "object" } },
    { "type": "review.round_ready", "schema": { "type": "object" } }
  ]
}
```

Why this step: explicit events keep observability and future trigger wiring stable.

## 3) Register MCP tools

In `contract/mcp-tools.json`, define:

| Tool | Path | Purpose |
|------|------|---------|
| `create_preview_review_session` | `POST /sessions` | Create a new review instance |
| `wait_for_human_review` | `POST /sessions/wait` | Block until reviewer acts |
| `signal_changes_applied` | `POST /sessions/changes-applied` | Return to review after code updates |
| `get_session` | `POST /sessions/get` | Read latest session state for UI refresh |

Example tool block:

```json
"signal_changes_applied": {
  "description": "Signal that agent updates are ready for re-review",
  "http": { "method": "POST", "path": "/sessions/changes-applied" },
  "input_schema": {
    "type": "object",
    "required": ["instance_id", "preview_url"],
    "properties": {
      "instance_id": { "type": "string" },
      "preview_url": { "type": "string", "format": "uri" }
    }
  }
}
```

Then map them in `capability.manifest.json`:

```json
"mcp_tools_by_version": {
  "1.0.0": [
    "create_preview_review_session",
    "wait_for_human_review",
    "signal_changes_applied",
    "get_session"
  ]
}
```

Why this step: the live MCP catalog only includes tools both declared and mapped.

## 4) Build a split React canvas UI

Create this file layout:

```text
ui/shell.html
ui/src/
  mount.tsx
  App.tsx
  types.ts
  lib/
    hub-client.ts
    session-api.ts
  components/
    error/
      CapabilityErrorBoundary.tsx
      CapabilityErrorState.tsx
    SessionHeader.tsx
    PreviewPane.tsx
    ReviewActions.tsx
    CommentsList.tsx
```

Why this step: separating bridge/client logic from rendering keeps each piece easy to test, and the scaffolded error components give you a default visual failure state.

### 4.1 Shared UI types (`ui/src/types.ts`)

```typescript
export interface HostCtx {
  spaceId: string;
  instanceId: string;
  hubUrl: string;
  packageId: string;
  version: string;
}

export interface ReviewComment {
  text: string;
  author?: string;
}

export interface SessionView {
  instance_id: string;
  state: "pending_review" | "pending_agent" | "resolved" | string;
  title?: string;
  preview_url?: string;
  comments?: ReviewComment[];
}
```

### 4.2 Hub bridge wrapper (`ui/src/lib/hub-client.ts`)

```typescript
import type { HubBridgeClient } from "@studio/capability-dev-kit/react";

export function createHubJson(bridge: HubBridgeClient) {
  return async function hubJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await bridge.fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers as Record<string, string>),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<T>;
  };
}
```

Why this step: the canvas iframe is sandboxed and cannot directly reuse shell auth headers, so all hub access should go through the dev-kit bridge client.

### 4.3 Session API wrapper (`ui/src/lib/session-api.ts`)

```typescript
import type { SessionView, ReviewComment } from "../types";

const API = "/api/preview-review";

export function createSessionApi(
  hubJson: <T>(path: string, init?: RequestInit) => Promise<T>,
) {
  return {
    getSession(instanceId: string) {
      return hubJson<SessionView>(`${API}/sessions/get`, {
        method: "POST",
        body: JSON.stringify({ instance_id: instanceId }),
      });
    },
    approve(instanceId: string) {
      return hubJson<{ ok: true }>(`${API}/sessions/approve`, {
        method: "POST",
        body: JSON.stringify({ instance_id: instanceId }),
      });
    },
    requestChanges(instanceId: string, comments: ReviewComment[]) {
      return hubJson<{ ok: true }>(`${API}/sessions/request-changes`, {
        method: "POST",
        body: JSON.stringify({ instance_id: instanceId, comments }),
      });
    },
  };
}
```

Why this step: component code stays declarative when HTTP details live in one API module.

### 4.4 Presentational components

`ui/src/components/SessionHeader.tsx`

```tsx
export function SessionHeader({ title, state }: { title?: string; state: string }) {
  return (
    <header>
      <h1>{title ?? "Preview review"}</h1>
      <p><span>{state}</span></p>
    </header>
  );
}
```

`ui/src/components/PreviewPane.tsx`

```tsx
export function PreviewPane({ previewUrl }: { previewUrl?: string }) {
  return (
    <section>
      <iframe src={previewUrl ?? "about:blank"} title="Preview" style={{ width: "100%", height: 420, border: 0 }} />
    </section>
  );
}
```

`ui/src/components/CommentsList.tsx`

```tsx
import type { ReviewComment } from "../types";

export function CommentsList({ comments }: { comments: ReviewComment[] }) {
  if (!comments.length) return null;
  return (
    <ul>
      {comments.map((c, i) => (
        <li key={i}>{c.author ?? "reviewer"}: {c.text}</li>
      ))}
    </ul>
  );
}
```

`ui/src/components/ReviewActions.tsx`

```tsx
import { useState } from "react";

interface Props {
  readonly: boolean;
  busy: boolean;
  onApprove: () => Promise<void>;
  onRequestChanges: (feedback: string) => Promise<void>;
}

export function ReviewActions({ readonly, busy, onApprove, onRequestChanges }: Props) {
  const [feedback, setFeedback] = useState("");
  if (readonly) return <p>Review complete.</p>;
  return (
    <section>
      <label htmlFor="feedback">Feedback (optional)</label>
      <textarea id="feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <div>
        <button disabled={busy} onClick={() => void onApprove()}>Approve</button>
        <button disabled={busy} onClick={() => void onRequestChanges(feedback.trim())}>Request changes</button>
      </div>
    </section>
  );
}
```

### 4.5 Compose behavior in `ui/src/App.tsx`

```tsx
import { useCapabilityContextPublic, useHubBridgeClient } from "@studio/capability-dev-kit/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionHeader } from "./components/SessionHeader";
import { PreviewPane } from "./components/PreviewPane";
import { ReviewActions } from "./components/ReviewActions";
import { CommentsList } from "./components/CommentsList";
import { createHubJson } from "./lib/hub-client";
import { createSessionApi } from "./lib/session-api";
import type { SessionView } from "./types";

export function App() {
  const ctx = useCapabilityContextPublic();
  const bridge = useHubBridgeClient();
  const hubJson = useMemo(() => createHubJson(bridge), [bridge]);
  const sessionApi = useMemo(() => createSessionApi(hubJson), [hubJson]);
  const [session, setSession] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setSession(await sessionApi.getSession(ctx.instanceId));
  }, [ctx.instanceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onApprove = useCallback(async () => {
    setBusy(true);
    try {
      await sessionApi.approve(ctx.instanceId);
      await reload();
    } finally {
      setBusy(false);
    }
  }, [ctx.instanceId, reload]);

  const onRequestChanges = useCallback(async (feedback: string) => {
    setBusy(true);
    try {
      await sessionApi.requestChanges(
        ctx.instanceId,
        feedback ? [{ text: feedback, author: "reviewer" }] : [],
      );
      await reload();
    } finally {
      setBusy(false);
    }
  }, [ctx.instanceId, reload]);

  if (!session) return <p>Loading review session...</p>;
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <SessionHeader title={session.title} state={session.state} />
      <PreviewPane previewUrl={session.preview_url} />
      <ReviewActions
        readonly={session.state === "resolved"}
        busy={busy}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
      />
      <CommentsList comments={session.comments ?? []} />
    </main>
  );
}
```

Why this step: business flow stays in one container component while rendering stays in reusable leaf components, and host/bridge context comes from public dev-kit hooks only.

### 4.6 Mount/bootstrap (`ui/src/mount.tsx`)

```tsx
import type { CapabilityHostContext } from "@studio/capability-sdk/host";
import { createCapabilityMount } from "@studio/capability-dev-kit";
import { App } from "./App";
import { CapabilityErrorBoundary } from "./components/error/CapabilityErrorBoundary";

const mountReactApp = createCapabilityMount({
  App,
  Boundary: CapabilityErrorBoundary,
});

export function mount(root: HTMLElement, ctx: CapabilityHostContext): () => void {
  return mountReactApp(root, ctx);
}
```

Why this step: the scaffolded `ui/shell.html` already handles the shell postMessage wiring (`init`, bridge fetch, `reload`), so `mount.tsx` only exposes the mount contract.

## 5) Server helper and routes

Keep server code split into:

- `server/hub.ts` - shared authenticated `hubJson(...)` helper
- `server/index.ts` - route handlers only

Route checklist for `server/index.ts`:

- `POST /sessions` - create instance, seed metadata
- `POST /sessions/get` - read state + metadata for canvas
- `POST /sessions/wait` - pending/resolved wait contract
- `POST /sessions/approve` - transition to `resolved`
- `POST /sessions/request-changes` - patch comments + transition to `pending_agent`
- `POST /sessions/changes-applied` - update preview URL + transition to `pending_review`

Important: read current revision and pass `expected_revision` on every patch/transition call.

## 6) Validate and build (explicit build step)

```bash
npm run validate:capability
npm run build:capability
```

or:

```bash
studio capability validate . --json
studio capability build .
```

Why this step: `build` bundles your multi-file React tree (and server routes) into the staged artifact consumed by push/apply.

### 6.1 Optional local simulator check (`dev --sim`)

Before pushing to a hub, you can smoke-test the canvas and lifecycle transitions locally:

```bash
npm run dev:capability -- --port 4310
```

Then open `http://127.0.0.1:4310`.

What to verify:

- iframe canvas loads your React app
- install state transitions work (`draft -> validated -> tested -> promoted -> live`)
- your error boundary renders cleanly if you throw from a component

Quick checkpoint before Part 2:

- Contract validates
- Build outputs `ui/entry.js` and `server/mount.mjs`
- MCP tools are both declared and mapped
- Canvas loads with `Loading review session...` before first API response

## Next

[Part 2 - Install and connect ->](./02-install-and-connect)
