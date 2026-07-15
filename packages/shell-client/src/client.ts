import type { ShellClient, ShellClientOptions, SpaceSummary, SseTicketResponse, JournalSsePayload } from "./types.js";
import { JOURNAL_SSE_EVENTS, parseSseMessage } from "./sse.js";

export class ShellClientHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: {
      code?: string;
      message?: string;
      errors?: unknown[];
      active_run_ids?: string[];
      max_concurrent_runs?: number;
    },
    fallback: string,
  ) {
    super(body.message ?? fallback);
  }
}

async function throwHttpError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as {
    code?: string;
    message?: string;
    errors?: unknown[];
    active_run_ids?: string[];
    max_concurrent_runs?: number;
  };
  throw new ShellClientHttpError(res.status, body, fallback);
}

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
      async runs(space_id) {
        const res = await fetch(`${base}/v1/spaces/${encodeURIComponent(space_id)}/runs`, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`spaces.runs failed: ${res.status}`);
        return res.json() as Promise<{
          space_id: string;
          runs: import("./types.js").SpaceHomeRunRow[];
        }>;
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
        if (!res.ok) await throwHttpError(res, `spaces.runFlow failed: ${res.status}`);
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
        if (!res.ok) await throwHttpError(res, `runs.resolveStep failed: ${res.status}`);
        return res.json() as Promise<{
          ok: boolean;
          run_id: string;
          step_id: string;
          branch: string;
          status: string;
        }>;
      },
      async createUploadIntent(run_id, step_id, body) {
        const res = await fetch(
          `${base}/v1/runs/${encodeURIComponent(run_id)}/steps/${encodeURIComponent(step_id)}/upload-intents`,
          {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) await throwHttpError(res, `runs.createUploadIntent failed: ${res.status}`);
        return res.json() as Promise<import("./types.js").UploadIntentResponse>;
      },
      async uploadIntentFile(intent_id, index, file, options = {}) {
        const url = `${base}/v1/upload-intents/${encodeURIComponent(intent_id)}/files/${index}`;
        if (typeof XMLHttpRequest !== "undefined") {
          return new Promise<{ received_bytes: number }>((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("PUT", url);
            request.setRequestHeader("Authorization", `Bearer ${token}`);
            request.setRequestHeader("Content-Type", "application/octet-stream");
            request.upload.onprogress = (event) => {
              options.onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size);
            };
            request.onerror = () => reject(new Error("Upload network failure"));
            request.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
            request.onload = () => {
              const body = JSON.parse(request.responseText || "{}") as {
                received_bytes?: number;
                code?: string;
                message?: string;
                errors?: unknown[];
              };
              if (request.status < 200 || request.status >= 300) {
                reject(new ShellClientHttpError(request.status, body, `upload failed: ${request.status}`));
                return;
              }
              resolve({ received_bytes: body.received_bytes ?? file.size });
            };
            const abort = () => request.abort();
            options.signal?.addEventListener("abort", abort, { once: true });
            request.onloadend = () => options.signal?.removeEventListener("abort", abort);
            request.send(file);
          });
        }
        const res = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
          },
          body: file,
          signal: options.signal,
        });
        if (!res.ok) await throwHttpError(res, `upload failed: ${res.status}`);
        options.onProgress?.(file.size, file.size);
        return res.json() as Promise<{ received_bytes: number }>;
      },
      async cancelUploadIntent(intent_id) {
        const res = await fetch(`${base}/v1/upload-intents/${encodeURIComponent(intent_id)}`, {
          method: "DELETE",
          headers: authHeaders(token),
        });
        if (!res.ok && res.status !== 410) {
          await throwHttpError(res, `runs.cancelUploadIntent failed: ${res.status}`);
        }
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
      async cancel(run_id, body = {}) {
        const res = await fetch(`${base}/v1/runs/${encodeURIComponent(run_id)}/cancel`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`runs.cancel failed: ${res.status}`);
        return res.json() as Promise<{ run: { run_id: string; lifecycle: string } }>;
      },
    },
  };
}

export type { ShellClient, ShellClientOptions, SpaceSummary, SseTicketResponse, JournalSsePayload };
