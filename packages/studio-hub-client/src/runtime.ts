export interface HealthResponse {
  status: string;
  version: string;
  uptime_s: number;
  capabilities: string[];
}

export interface HubClientOptions {
  baseUrl: string;
  token: string;
}

export interface CapabilityProject {
  package_id: string;
  source: string;
}

export interface HubClientRuntime {
  health(): Promise<HealthResponse>;
  spaces: { get(spaceId: string): Promise<unknown> };
  instances: {
    list(spaceId: string): Promise<unknown[]>;
    get(spaceId: string, id: string): Promise<unknown>;
  };
  gates: {
    list(spaceId: string): Promise<unknown[]>;
    resolve(spaceId: string, gateId: string, body: Record<string, unknown>): Promise<unknown>;
  };
  events: {
    tail(spaceId: string, fromSeq: number): Promise<unknown[]>;
    subscribe(spaceId: string, onEvent: (event: string, data: unknown) => void): () => void;
  };
  audit: {
    export(spaceId: string, params?: { since?: string; instance_id?: string }): Promise<Blob>;
  };
  sharedConfig: {
    get(): Promise<{ capabilityProjects: CapabilityProject[]; hubs: unknown[] }>;
    setProjects(projects: CapabilityProject[]): Promise<{ capabilityProjects: CapabilityProject[] }>;
  };
}

export type HubClient = HubClientRuntime & import("./config.js").HubClientConfig;

export function createRuntimeClient(
  base: string,
  headers: () => Record<string, string>,
): HubClientRuntime {
  return {
    async health() {
      const res = await fetch(`${base}/v1/health`);
      return res.json() as Promise<HealthResponse>;
    },
    spaces: {
      async get(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}`, { headers: headers() });
        return res.json();
      },
    },
    instances: {
      async list(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/instances`, { headers: headers() });
        const body = (await res.json()) as { instances: unknown[] };
        return body.instances;
      },
      async get(spaceId, id) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/instances/${id}`, {
          headers: headers(),
        });
        return res.json();
      },
    },
    gates: {
      async list(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/gates`, { headers: headers() });
        const body = (await res.json()) as { gates: unknown[] };
        return body.gates;
      },
      async resolve(spaceId, gateId, body) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/gates/${gateId}/resolve`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return res.json();
      },
    },
    events: {
      async tail(spaceId, fromSeq) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/events?from_seq=${fromSeq}`, {
          headers: headers(),
        });
        const body = (await res.json()) as { events: unknown[] };
        return body.events;
      },
      subscribe(spaceId, onEvent) {
        const es = new EventSource(`${base}/v1/spaces/${spaceId}/events/subscribe`);
        for (const type of [
          "journal.append",
          "gate.pending",
          "gate.resolved",
          "heartbeat",
          "capability.dev_reload",
          "capability.live_applied",
        ]) {
          es.addEventListener(type, (e) => {
            try {
              onEvent(type, JSON.parse((e as MessageEvent).data));
            } catch {
              onEvent(type, (e as MessageEvent).data);
            }
          });
        }
        return () => es.close();
      },
    },
    audit: {
      async export(spaceId, params) {
        const q = new URLSearchParams();
        if (params?.since) q.set("since", params.since);
        if (params?.instance_id) q.set("instance_id", params.instance_id);
        const res = await fetch(`${base}/v1/spaces/${spaceId}/audit/export?${q}`, {
          headers: headers(),
        });
        return res.blob();
      },
    },
    sharedConfig: {
      async get() {
        const res = await fetch(`${base}/v1/studio/shared-config`, { headers: headers() });
        return res.json();
      },
      async setProjects(projects) {
        const res = await fetch(`${base}/v1/studio/shared-config/projects`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ capabilityProjects: projects }),
        });
        return res.json();
      },
    },
  };
}
