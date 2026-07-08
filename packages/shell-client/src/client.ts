import type { ShellClient, ShellClientOptions, SpaceSummary, SseTicketResponse, JournalSsePayload } from "./types.js";
import { JOURNAL_SSE_EVENTS, parseSseMessage } from "./sse.js";

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function createShellClient(opts: ShellClientOptions): ShellClient {
  const base = opts.baseUrl.replace(/\/$/, "");
  const token = opts.token;

  return {
    spaces: {
      async list() {
        const res = await fetch(`${base}/v1/spaces`, { headers: authHeaders(token) });
        if (!res.ok) {
          throw new Error(`spaces.list failed: ${res.status}`);
        }
        const body = (await res.json()) as { spaces: Array<Record<string, unknown>> };
        return body.spaces.map((s) => ({
          space_id: String(s.space_id),
          slug: s.slug ? String(s.slug) : undefined,
          name: s.name ? String(s.name) : undefined,
          description: s.description ? String(s.description) : undefined,
        }));
      },
      async home(space_id) {
        const res = await fetch(`${base}/v1/spaces/${encodeURIComponent(space_id)}/home`, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`spaces.home failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").SpaceHomePayload>;
      },
      async flowPreview(space_id, flow_id) {
        const res = await fetch(
          `${base}/v1/spaces/${encodeURIComponent(space_id)}/flows/${encodeURIComponent(flow_id)}/preview`,
          { headers: authHeaders(token) },
        );
        if (!res.ok) throw new Error(`spaces.flowPreview failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").FlowPreviewPayload>;
      },
      async runFlow(flow_id, body) {
        const res = await fetch(`${base}/v1/flows/${encodeURIComponent(flow_id)}/run`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`spaces.runFlow failed: ${res.status}`);
        return res.json() as Promise<{
          session: { session_id: string; title: string };
          run_id: string;
          flow_digest: string;
        }>;
      },
    },
    me: {
      async get() {
        const res = await fetch(`${base}/v1/me`, { headers: authHeaders(token) });
        if (!res.ok) throw new Error(`me.get failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").UserProfile>;
      },
      async patch(body) {
        const res = await fetch(`${base}/v1/me`, {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`me.patch failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").UserProfile>;
      },
    },
    notifications: {
      async list(status) {
        const q = status ? `?status=${encodeURIComponent(status)}` : "";
        const res = await fetch(`${base}/v1/notifications${q}`, { headers: authHeaders(token) });
        if (!res.ok) throw new Error(`notifications.list failed: ${res.status}`);
        return res.json() as Promise<{ notifications: import("./types.js").NotificationItem[]; pending_count: number }>;
      },
      async dismiss(notification_id) {
        const res = await fetch(`${base}/v1/notifications/${encodeURIComponent(notification_id)}/dismiss`, {
          method: "POST",
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`notifications.dismiss failed: ${res.status}`);
      },
    },
    gates: {
      async listForRun(run_id) {
        const res = await fetch(`${base}/v1/runs/${encodeURIComponent(run_id)}/gates`, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`gates.listForRun failed: ${res.status}`);
        const body = (await res.json()) as { gates: import("./types.js").GateItem[] };
        return body.gates;
      },
      async resolve(gate_id, body) {
        const res = await fetch(`${base}/v1/gates/${encodeURIComponent(gate_id)}/resolve`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`gates.resolve failed: ${res.status}`);
        const data = (await res.json()) as { gate: import("./types.js").GateItem };
        return data.gate;
      },
    },
    dev: {
      async viewSession(space_id) {
        const res = await fetch(
          `${base}/v1/spaces/${encodeURIComponent(space_id)}/dev/view-session`,
          { headers: authHeaders(token) },
        );
        if (!res.ok) throw new Error(`dev.viewSession failed: ${res.status}`);
        return res.json() as Promise<{ session: import("./types.js").ViewDevSessionPayload }>;
      },
      async viewFixture(space_id, view_id, fixture_name) {
        const res = await fetch(
          `${base}/v1/spaces/${encodeURIComponent(space_id)}/dev/view-fixtures/${encodeURIComponent(view_id)}/${encodeURIComponent(fixture_name)}`,
          { headers: authHeaders(token) },
        );
        if (!res.ok) throw new Error(`dev.viewFixture failed: ${res.status}`);
        return res.json() as Promise<{ context: Record<string, unknown> }>;
      },
    },
    auth: {
      async mintSseTicket() {
        const res = await fetch(`${base}/v1/auth/sse-ticket`, {
          method: "POST",
          headers: authHeaders(token),
        });
        if (!res.ok) {
          throw new Error(`auth.mintSseTicket failed: ${res.status}`);
        }
        return res.json() as Promise<{ ticket: string; expires_in: number }>;
      },
    },
    journal: {
      subscribe(onEvent) {
        let closed = false;
        let es: EventSource | null = null;
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = async () => {
          if (closed) return;
          try {
            const { ticket } = await fetch(`${base}/v1/auth/sse-ticket`, {
              method: "POST",
              headers: authHeaders(token),
            }).then((r) => {
              if (!r.ok) throw new Error(`sse-ticket: ${r.status}`);
              return r.json() as Promise<{ ticket: string }>;
            });

            if (closed) return;
            es?.close();
            es = new EventSource(`${base}/v1/journal/subscribe?ticket=${encodeURIComponent(ticket)}`);

            for (const type of JOURNAL_SSE_EVENTS) {
              es.addEventListener(type, (e) => {
                const parsed = parseSseMessage(type, (e as MessageEvent).data);
                if (parsed) onEvent(parsed);
              });
            }

            es.onerror = () => {
              es?.close();
              es = null;
              if (!closed) {
                refreshTimer = setTimeout(() => void connect(), 3000);
              }
            };
          } catch {
            if (!closed) {
              refreshTimer = setTimeout(() => void connect(), 5000);
            }
          }
        };

        void connect();

        return () => {
          closed = true;
          if (refreshTimer) clearTimeout(refreshTimer);
          es?.close();
        };
      },
      async query(params) {
        const search = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v) search.set(k, v);
        }
        const res = await fetch(`${base}/v1/journal?${search}`, { headers: authHeaders(token) });
        if (!res.ok) throw new Error(`journal.query failed: ${res.status}`);
        const body = (await res.json()) as { entries: import("./types.js").JournalEntryItem[] };
        return body.entries;
      },
    },
    sessions: {
      async get(session_id) {
        const res = await fetch(`${base}/v1/sessions/${encodeURIComponent(session_id)}`, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`sessions.get failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").SessionDetailPayload>;
      },
      async listRuns(session_id) {
        const res = await fetch(`${base}/v1/sessions/${encodeURIComponent(session_id)}/runs`, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`sessions.listRuns failed: ${res.status}`);
        return res.json() as Promise<{ runs: Array<{ run_id: string; lifecycle: string; flow_id?: string | null }> }>;
      },
    },
    runs: {
      async get(run_id) {
        const res = await fetch(`${base}/v1/runs/${encodeURIComponent(run_id)}`, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`runs.get failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").RunDetailPayload>;
      },
      async graph(run_id) {
        const res = await fetch(`${base}/v1/runs/${encodeURIComponent(run_id)}/graph`, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`runs.graph failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").RunGraphPayload>;
      },
      async resolveStep(run_id, step_id, body) {
        const res = await fetch(
          `${base}/v1/runs/${encodeURIComponent(run_id)}/steps/${encodeURIComponent(step_id)}/resolve`,
          {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) throw new Error(`runs.resolveStep failed: ${res.status}`);
        return res.json() as Promise<{
          ok: boolean;
          run_id: string;
          step_id: string;
          branch: string;
          status: string;
        }>;
      },
      async retry(run_id, body = {}) {
        const res = await fetch(`${base}/v1/runs/${encodeURIComponent(run_id)}/retry`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`runs.retry failed: ${res.status}`);
        return res.json() as Promise<{ run: { run_id: string } }>;
      },
    },
  };
}

export type { ShellClient, ShellClientOptions, SpaceSummary, SseTicketResponse, JournalSsePayload };
