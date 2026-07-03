# Murrmure feedback inbox

Structured failure reports and improvement requests from **agentStudioDev** (and other Murrmure-connected repos).

Each file is written by the feedback agent when a feedback event is received (hooks on `spc_murrmure`).

## Event types

| Event | When to emit | Action invoked |
|-------|----------------|----------------|
| `murrmure.feedback.failure` | Tests, CI, or integration broke | `run_feedback_agent` (`kind: failure`) |
| `murrmure.feedback.requestImprovement` | Friction, missing feature, or DX idea (no hard failure) | `run_feedback_agent` (`kind: improvement`) |

## File naming

- Failures: `YYYY-MM-DD-failure-<slug>.md`
- Improvements: `YYYY-MM-DD-improvement-<slug>.md`

Slug derived from `failure_type` / `topic` and a short summary.

## Failure report sections

1. **Summary** — what failed
2. **Context** — repo, branch, environment
3. **Evidence** — logs, docs, repro steps
4. **Murrmure improvement** — concrete product or DX suggestion
5. **Source** — link back to the originating event or CI run

## Improvement request sections

1. **Topic** — area of Murrmure (MCP, hooks, CLI, Desktop, …)
2. **Summary** — what felt wrong or missing
3. **Suggestion** — concrete improvement proposal
4. **Context** — where you hit this (workflow, repo, tool)
5. **Source** — originating space / event

## Agent instructions

**On `run_feedback_agent`:** write the appropriate file under `feedbacks/` (failure or improvement sections per hook `kind` and `instruction`).

`source` and `repo` are inferred by the hub — do not set them manually in the payload.

## Emitter (agentStudioDev side)

From a connected MCP agent on `spc_my_space` with `event:emit`:

**Discover emittable events** (before emitting):

```json
{
  "name": "murrmure_list_emittable_events",
  "arguments": {}
}
```

Or `GET /v1/spaces/spc_my_space/events/emittable` with `space:read`.

The Space Home UI also shows **Events you can trigger** for the connected space.

**Failure:**

```json
{
  "name": "murrmure_emit_event",
  "arguments": {
    "event_type": "murrmure.feedback.failure",
    "payload": {
      "failure_type": "test_failure",
      "summary": "Short description of what failed",
      "logs": "URL or excerpt",
      "docs": "Relevant doc excerpt or path",
      "context": { "branch": "main", "step": "e2e-checkout" }
    }
  }
}
```

**Improvement request:**

```json
{
  "name": "murrmure_emit_event",
  "arguments": {
    "event_type": "murrmure.feedback.requestImprovement",
    "payload": {
      "topic": "mcp_discovery",
      "summary": "Agent cannot see which events it may emit after apply",
      "suggestion": "Expose emit catalog in space home and MCP",
      "docs": "Optional link or excerpt",
      "context": { "workflow": "cross-repo feedback bridge" }
    }
  }
}
```

Grant needs `event:emit` on the caller space (`spc_my_space`).

**Receiver space:** `spc_murrmure` (slug: `murrmure`, hub: `http://127.0.0.1:8787`).

Hooks invoke `run_feedback_agent` via **`shell_spawn`**. The action **`prompt`** template composes the agent message; **`command`** runs the harness:

```yaml
prompt: |
  ## Task
  {{instruction}}
  ...
command: cursor agent -p --force {{prompt}}
```

Hook `params` fill `{{instruction}}`, `{{kind}}`, `{{topic}}`, etc. Hub sets `{{run_id}}`, `{{session_id}}`, `{{space_root}}` at dispatch.

After changing `murrmure/actions.yaml` or `executors.yaml`:

```bash
mrmr space apply
```

```bash
mrmr grant mint --space spc_my_space --label "agentStudioDev agent" --capabilities space:read,event:emit
```
