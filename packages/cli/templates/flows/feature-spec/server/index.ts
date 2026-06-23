import type { FlowServerContext, HonoLike } from "@murrmure/flow-dev-kit/server";

export const FEATURE_SPEC_CONTRACT = "cref_feature_spec";

type SpecJson = {
  protocol_version: "1";
  spec_key: string;
  title: string;
  state: string;
  version: number;
  summary?: string;
  sections: Record<string, { title: string; body: string; order: number }>;
  context_refs: Array<{ kind: "url" | "blob"; ref: string; label?: string }>;
  target_repo?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
};

interface SpecBag {
  title?: string;
  summary?: string;
  version?: number;
  sections?: Record<string, { title: string; body: string; order: number }>;
  context_refs?: Array<{ kind: "url" | "blob"; ref: string; label?: string }>;
  target_repo?: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface InstanceLike {
  instance_id: string;
  state: string;
  revision: number;
  contract_ref_id: string;
  metadata?: { spec?: SpecBag } & Record<string, unknown>;
}

function toSpecJson(instance: InstanceLike): SpecJson {
  const spec = (instance.metadata?.spec ?? instance.metadata ?? {}) as SpecBag;
  return {
    protocol_version: "1",
    spec_key: instance.instance_id,
    title: spec.title ?? "Untitled",
    state: instance.state,
    version: spec.version ?? 1,
    summary: spec.summary,
    sections: spec.sections ?? {},
    context_refs: spec.context_refs ?? [],
    target_repo: spec.target_repo,
    created_at: spec.created_at ?? new Date().toISOString(),
    updated_at: spec.updated_at ?? new Date().toISOString(),
    published_at: spec.published_at,
  };
}

function buildSummary(spec: SpecJson): string {
  if (spec.summary) return spec.summary.slice(0, 512);
  const sections = Object.values(spec.sections).sort((a, b) => a.order - b.order);
  const overview = sections.find((s) => s.title.toLowerCase() === "overview") ?? sections[0];
  return (overview?.body ?? "").slice(0, 512);
}

function assembleBody(spec: SpecJson): string {
  const sections = Object.entries(spec.sections)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([, s]) => `# ${s.title}\n\n${s.body}`)
    .join("\n\n---\n\n");
  return `# ${spec.title}\n\n${sections}`;
}

class SpecHandler {
  constructor(
    private readonly hub: FlowServerContext["hub"],
    private readonly actorId: string,
    private readonly getInstallConfig: () => Record<string, unknown>,
  ) {}

  private provenance(instanceId?: string) {
    return { instance_id: instanceId, actor_id: this.actorId, token_id: "worker" };
  }

  async openSpec(input: { title?: string; target_repo?: string }): Promise<SpecJson> {
    const config = this.getInstallConfig();
    const result = await this.hub.execute({
      kind: "instance.create",
      provenance: this.provenance(),
      contract_ref_id: FEATURE_SPEC_CONTRACT,
      metadata: {
        spec: {
          title: input.title ?? "Untitled",
          version: 1,
          sections: {},
          context_refs: [],
          target_repo: input.target_repo ?? config.default_target_repo,
        },
      },
    });
    if (result.outcome !== "success") throw new Error(JSON.stringify(result.body));
    return this.getSpec(result.body!.instance_id as string);
  }

  async getSpec(specKey: string): Promise<SpecJson> {
    const instance = (await this.hub.query("instance.get", { instance_id: specKey })) as InstanceLike | null;
    if (!instance) throw new Error("SPEC_NOT_FOUND");
    return toSpecJson(instance);
  }

  async patchSection(
    specKey: string,
    input: { section_id: string; title: string; body: string; order: number },
  ): Promise<SpecJson> {
    const inst = await this.requireSpec(specKey);
    const spec = (inst.metadata?.spec ?? {}) as SpecBag;
    const sections = { ...(spec.sections ?? {}) };
    sections[input.section_id] = { title: input.title, body: input.body, order: input.order };
    await this.patchMetadata(specKey, inst, { spec: { ...spec, sections } });
    return this.getSpec(specKey);
  }

  async addContextRef(
    specKey: string,
    input: { kind: "url" | "blob"; ref: string; label?: string },
  ): Promise<SpecJson> {
    const inst = await this.requireSpec(specKey);
    const spec = (inst.metadata?.spec ?? {}) as SpecBag;
    const context_refs = [...(spec.context_refs ?? []), input];
    await this.patchMetadata(specKey, inst, { spec: { ...spec, context_refs } });
    return this.getSpec(specKey);
  }

  async transitionSpec(
    specKey: string,
    input: { event: string; expected_revision?: number },
  ): Promise<SpecJson> {
    const inst = await this.requireSpec(specKey);
    if (input.event === "revise_spec") {
      const spec = (inst.metadata?.spec ?? {}) as SpecBag;
      await this.patchMetadata(specKey, inst, { spec: { ...spec, version: Number(spec.version ?? 1) + 1 } });
    }
    const aggregate = (await this.hub.query("aggregate.get", { instance_id: specKey })) as { revision?: number } | null;
    const result = await this.hub.execute({
      kind: "state.transition",
      provenance: this.provenance(specKey),
      event: input.event,
      expected_revision: input.expected_revision ?? aggregate?.revision ?? 0,
    });
    if (result.outcome !== "success") throw new Error(JSON.stringify(result.body));
    return this.getSpec(specKey);
  }

  async publish(specKey: string, event: "publish_direct" | "approve_spec", commandId?: string): Promise<SpecJson> {
    const config = this.getInstallConfig();
    if (event === "publish_direct" && config.skip_review !== true) {
      const err = new Error("TRANSITION_GUARD_FAILED") as Error & { code: string; guard: string };
      err.code = "TRANSITION_GUARD_FAILED";
      err.guard = "skip_review";
      throw err;
    }
    const spec = toSpecJson(await this.requireSpec(specKey));
    await this.hub.execute({
      kind: "blob.write",
      provenance: this.provenance(specKey),
      media_type: "text/markdown",
      content_base64: Buffer.from(assembleBody(spec), "utf-8").toString("base64"),
    });
    const aggregate = (await this.hub.query("aggregate.get", { instance_id: specKey })) as { revision?: number } | null;
    const result = await this.hub.execute({
      kind: "state.transition",
      provenance: { ...this.provenance(specKey), command_id: commandId },
      event,
      expected_revision: aggregate?.revision ?? 0,
    });
    if (result.outcome !== "success" || result.body?.checkpoint_id) throw new Error(JSON.stringify(result.body));
    const summary = buildSummary(spec);
    await this.hub.execute({
      kind: "event.append",
      provenance: this.provenance(specKey),
      event_type: "spec.published",
      payload: {
        spec_id: specKey,
        spec_key: specKey,
        title: spec.title,
        version: spec.version,
        summary,
        body_ref: `blob:spec/${specKey}/${spec.version}`,
        section_count: Object.keys(spec.sections).length,
        published_by: this.actorId,
      },
    });
    const latest = await this.requireSpec(specKey);
    const meta = (latest.metadata?.spec ?? {}) as SpecBag;
    await this.patchMetadata(specKey, latest, {
      spec: { ...meta, summary, published_at: new Date().toISOString() },
    });
    return this.getSpec(specKey);
  }

  async querySpecSummary(specKey?: string): Promise<Record<string, unknown>> {
    const instances = (await this.hub.query("instance.list", {})) as InstanceLike[];
    const specs = instances.filter((i) => i.contract_ref_id === FEATURE_SPEC_CONTRACT);
    const updatedAt = (i: InstanceLike) => ((i.metadata?.spec as SpecBag)?.updated_at ?? "");
    const target =
      specKey != null
        ? specs.find((s) => s.instance_id === specKey)
        : specs.filter((s) => s.state === "published").sort((a, b) => updatedAt(b).localeCompare(updatedAt(a)))[0];
    if (!target || target.state !== "published") throw new Error("SPEC_NOT_PUBLISHED");
    const json = toSpecJson(target);
    return {
      spec_key: json.spec_key,
      title: json.title,
      version: json.version,
      summary: buildSummary(json),
      section_count: Object.keys(json.sections).length,
      published_at: json.published_at,
    };
  }

  private async requireSpec(specKey: string): Promise<InstanceLike> {
    const instance = (await this.hub.query("instance.get", { instance_id: specKey })) as InstanceLike | null;
    if (!instance) throw new Error("SPEC_NOT_FOUND");
    return instance;
  }

  private async patchMetadata(specKey: string, inst: InstanceLike, patch: Record<string, unknown>): Promise<void> {
    const result = await this.hub.execute({
      kind: "instance.metadata.patch",
      provenance: this.provenance(specKey),
      patch,
      expected_revision: inst.revision,
    });
    if (result.outcome !== "success") throw new Error(JSON.stringify(result.body));
  }
}

type RouteCtx = {
  hub: FlowServerContext["hub"];
  getInstallConfig: () => Record<string, unknown>;
  req: {
    param: (n: string) => string;
    query: (n: string) => string | null;
    json: () => Promise<unknown>;
    header: (n: string) => string | undefined;
  };
  json: (v: unknown, status?: number) => unknown;
};

export function mountRoutes(app: HonoLike, ctx: FlowServerContext): void {
  async function createHandler(c: RouteCtx): Promise<SpecHandler> {
    let actorId = "system";
    try {
      actorId = (await c.hub.getPrincipal()).actorId;
    } catch {
      /* fallback for internal/system calls */
    }
    return new SpecHandler(c.hub, actorId, c.getInstallConfig);
  }

  app.get("/health", (c) => (c as RouteCtx).json({ ok: true, flow: ctx.flowId, version: ctx.version }));

  app.post("/specs", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json()) as { title?: string; target_repo?: string };
    try {
      return cc.json(await (await createHandler(cc)).openSpec(body), 201);
    } catch (e) {
      return cc.json({ code: "OPEN_FAILED", message: String(e) }, 500);
    }
  });

  app.get("/specs", async (c) => {
    const cc = c as RouteCtx;
    const instances = (await ctx.hub.query("instance.list", {})) as InstanceLike[];
    return cc.json(
      instances
        .filter((i) => i.contract_ref_id === FEATURE_SPEC_CONTRACT)
        .map((i) => {
          const s = toSpecJson(i);
          return { spec_key: s.spec_key, title: s.title, state: s.state, version: s.version, updated_at: s.updated_at };
        }),
    );
  });

  app.get("/specs/:key", async (c) => {
    const cc = c as RouteCtx;
    try {
      return cc.json(await (await createHandler(cc)).getSpec(cc.req.param("key")));
    } catch {
      return cc.json({ code: "SPEC_NOT_FOUND" }, 404);
    }
  });

  app.patch("/specs/:key/sections/:id", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json()) as Record<string, unknown>;
    const input = {
      section_id: cc.req.param("id"),
      title: String(body.title ?? ""),
      body: String(body.body ?? ""),
      order: Number(body.order ?? 0),
    };
    try {
      return cc.json(await (await createHandler(cc)).patchSection(cc.req.param("key"), input));
    } catch {
      return cc.json({ code: "SPEC_NOT_FOUND" }, 404);
    }
  });

  app.post("/specs/:key/context-refs", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json()) as { kind: "url" | "blob"; ref: string; label?: string };
    try {
      return cc.json(await (await createHandler(cc)).addContextRef(cc.req.param("key"), body), 201);
    } catch {
      return cc.json({ code: "SPEC_NOT_FOUND" }, 404);
    }
  });

  app.post("/specs/:key/publish", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json().catch(() => ({}))) as { event?: string };
    const event = (body.event as "publish_direct" | "approve_spec") ?? "publish_direct";
    try {
      return cc.json(
        await (await createHandler(cc)).publish(cc.req.param("key"), event, cc.req.header("Idempotency-Key")),
      );
    } catch (e) {
      const err = e as Error & { code?: string; guard?: string };
      if (err.code === "TRANSITION_GUARD_FAILED") {
        return cc.json({ code: err.code, guard: err.guard, message: err.message }, 403);
      }
      return cc.json({ code: "PUBLISH_FAILED", message: String(e) }, 400);
    }
  });

  app.post("/specs/:key/transition", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json()) as { event: string; expected_revision?: number };
    try {
      return cc.json(await (await createHandler(cc)).transitionSpec(cc.req.param("key"), body));
    } catch (e) {
      return cc.json({ code: "TRANSITION_FAILED", message: String(e) }, 400);
    }
  });

  app.get("/query/spec_summary", async (c) => {
    const cc = c as RouteCtx;
    try {
      return cc.json(await (await createHandler(cc)).querySpecSummary(cc.req.query("spec_key") ?? undefined));
    } catch {
      return cc.json({ code: "SPEC_NOT_PUBLISHED" }, 404);
    }
  });
}
