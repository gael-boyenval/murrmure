export interface WhoamiResponse {
  actor_id: string;
  kind: string;
  token_id: string;
  spaces: Array<{ space_id: string; scopes: string[] }>;
  expires_at?: string;
}

export interface SpaceSummary {
  space_id: string;
  slug: string;
  name?: string;
  install_policy?: string;
  preview_policy?: string;
  status: string;
}

export interface HubClientConfig {
  auth: { whoami(): Promise<WhoamiResponse> };
  spaces: {
    list(): Promise<SpaceSummary[]>;
    create(body: Record<string, unknown>): Promise<SpaceSummary>;
    update(spaceId: string, body: Record<string, unknown>): Promise<SpaceSummary>;
    archive(spaceId: string): Promise<void>;
  };
  flows: {
    list(spaceId: string): Promise<unknown[]>;
    get(spaceId: string, installId: string): Promise<unknown>;
    install(spaceId: string, body: Record<string, unknown>): Promise<unknown>;
    configure(spaceId: string, installId: string, config: Record<string, unknown>): Promise<void>;
    validate(spaceId: string, installId?: string): Promise<unknown>;
    test(spaceId: string, installId?: string): Promise<unknown>;
    promote(spaceId: string, body?: Record<string, unknown>): Promise<unknown>;
    rollback(spaceId: string, installId: string, toVersion: string): Promise<unknown>;
    diff(spaceId: string, params: { from: string; to: string }): Promise<unknown>;
    downloadSource(spaceId: string, installId: string): Promise<Blob>;
  };
  /** @deprecated use flows */
  capabilities: HubClientConfig["flows"];
  members: {
    list(spaceId: string): Promise<unknown[]>;
    invite(spaceId: string, body: Record<string, unknown>): Promise<unknown>;
    updateRole(spaceId: string, memberId: string, role: string): Promise<unknown>;
    remove(spaceId: string, memberId: string): Promise<void>;
  };
  grants: {
    list(spaceId: string): Promise<unknown[]>;
    mint(spaceId: string, body: Record<string, unknown>): Promise<unknown>;
    revoke(spaceId: string, grantId: string): Promise<void>;
    rotate(spaceId: string, grantId: string): Promise<unknown>;
    exportHubWide(): Promise<Blob>;
  };
  triggers: {
    list(spaceId: string): Promise<unknown[]>;
    register(spaceId: string, body: Record<string, unknown>): Promise<unknown>;
    registerFromTemplate(spaceId: string, body: Record<string, unknown>): Promise<unknown>;
    templates(spaceId: string): Promise<unknown[]>;
    eventCatalog(spaceId: string): Promise<unknown[]>;
    testFire(spaceId: string, triggerId: string, body?: Record<string, unknown>): Promise<unknown>;
    disable(spaceId: string, triggerId: string): Promise<void>;
    deliveries(spaceId: string, params?: { limit?: number }): Promise<unknown[]>;
    replay(spaceId: string, triggerId: string, body: Record<string, unknown>): Promise<void>;
  };
  ops: {
    federationStatus(): Promise<unknown>;
  };
}

export function createConfigClient(
  base: string,
  headers: () => Record<string, string>,
): HubClientConfig {
  async function json<T>(res: Response): Promise<T> {
    const body = (await res.json()) as T & { message?: string; code?: string };
    if (!res.ok) {
      throw new Error(body.message ?? body.code ?? `Request failed (${res.status})`);
    }
    return body;
  }

  const flows = {
      async list(spaceId: string) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/flows`, { headers: headers() });
        const body = await json<{ flows: unknown[] }>(res);
        return body.flows;
      },
      async get(spaceId: string, installId: string) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/flows/${installId}`, {
          headers: headers(),
        });
        return json(res);
      },
      async install(spaceId: string, body: Record<string, unknown>) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/flows/install`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return json(res);
      },
      async configure(spaceId: string, installId: string, config: Record<string, unknown>) {
        await fetch(`${base}/v1/spaces/${spaceId}/flows/${installId}/config`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ config }),
        });
      },
      async validate(spaceId: string, installId?: string) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/evolution/validate`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(installId ? { install_id: installId } : {}),
        });
        return json(res);
      },
      async test(spaceId: string, installId?: string) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/evolution/test`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(installId ? { install_id: installId } : {}),
        });
        return json(res);
      },
      async promote(spaceId: string, body?: Record<string, unknown>) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/evolution/promote`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body ?? {}),
        });
        return json(res);
      },
      async rollback(spaceId: string, installId: string, toVersion: string) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/evolution/rollback`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ install_id: installId, to_version: toVersion }),
        });
        return json(res);
      },
      async diff(spaceId: string, params: { from: string; to: string }) {
        const q = new URLSearchParams({ from: params.from, to: params.to });
        const res = await fetch(`${base}/v1/spaces/${spaceId}/contracts/diff?${q}`, {
          headers: headers(),
        });
        return json(res);
      },
      async downloadSource(spaceId: string, installId: string) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/flows/${installId}/source`, {
          headers: headers(),
        });
        if (!res.ok) {
          const body = (await res.json()) as { message?: string; code?: string };
          throw new Error(body.message ?? body.code ?? `Request failed (${res.status})`);
        }
        return res.blob();
      },
  };

  return {
    auth: {
      async whoami() {
        const res = await fetch(`${base}/v1/auth/whoami`, { headers: headers() });
        return json(res);
      },
    },
    spaces: {
      async list() {
        const res = await fetch(`${base}/v1/spaces`, { headers: headers() });
        const body = await json<{ spaces: SpaceSummary[] }>(res);
        return body.spaces;
      },
      async create(body) {
        const res = await fetch(`${base}/v1/spaces`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return json(res);
      },
      async update(spaceId, body) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return json(res);
      },
      async archive(spaceId) {
        await fetch(`${base}/v1/spaces/${spaceId}/archive`, {
          method: "POST",
          headers: headers(),
        });
      },
    },
    flows,
    capabilities: flows,
    members: {
      async list(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/members`, { headers: headers() });
        const body = await json<{ members: unknown[] }>(res);
        return body.members;
      },
      async invite(spaceId, body) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/members`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return json(res);
      },
      async updateRole(spaceId, memberId, role) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/members/${memberId}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ role }),
        });
        return json(res);
      },
      async remove(spaceId, memberId) {
        await fetch(`${base}/v1/spaces/${spaceId}/members/${memberId}`, {
          method: "DELETE",
          headers: headers(),
        });
      },
    },
    grants: {
      async list(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/grants`, { headers: headers() });
        const body = await json<{ grants: unknown[] }>(res);
        return body.grants;
      },
      async mint(spaceId, body) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/grants`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return json(res);
      },
      async revoke(spaceId, grantId) {
        await fetch(`${base}/v1/spaces/${spaceId}/grants/${grantId}/revoke`, {
          method: "POST",
          headers: headers(),
        });
      },
      async rotate(spaceId, grantId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/grants/${grantId}/rotate`, {
          method: "POST",
          headers: headers(),
        });
        return json(res);
      },
      async exportHubWide() {
        const res = await fetch(`${base}/v1/ops/grants/export`, { headers: headers() });
        return res.blob();
      },
    },
    triggers: {
      async list(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/triggers`, { headers: headers() });
        const body = await json<{ triggers: unknown[] }>(res);
        return body.triggers;
      },
      async register(spaceId, body) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/triggers`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return json(res);
      },
      async registerFromTemplate(spaceId, body) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/triggers/from-template`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
        return json(res);
      },
      async templates(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/triggers/templates`, { headers: headers() });
        const body = await json<{ templates: unknown[] }>(res);
        return body.templates;
      },
      async eventCatalog(spaceId) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/triggers/event-catalog`, { headers: headers() });
        const body = await json<{ events: unknown[] }>(res);
        return body.events;
      },
      async testFire(spaceId, triggerId, body) {
        const res = await fetch(`${base}/v1/spaces/${spaceId}/triggers/${triggerId}/test-fire`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body ?? {}),
        });
        return json(res);
      },
      async disable(spaceId, triggerId) {
        await fetch(`${base}/v1/spaces/${spaceId}/triggers/${triggerId}/disable`, {
          method: "POST",
          headers: headers(),
        });
      },
      async deliveries(spaceId, params) {
        const q = params?.limit ? `?limit=${params.limit}` : "";
        const res = await fetch(`${base}/v1/spaces/${spaceId}/triggers/deliveries${q}`, {
          headers: headers(),
        });
        const body = await json<{ deliveries: unknown[] }>(res);
        return body.deliveries;
      },
      async replay(spaceId, triggerId, body) {
        await fetch(`${base}/v1/spaces/${spaceId}/triggers/${triggerId}/replay`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        });
      },
    },
    ops: {
      async federationStatus() {
        const res = await fetch(`${base}/v1/ops/federation/status`, { headers: headers() });
        return json(res);
      },
    },
  };
}
