import type { CapabilityServerContext, HonoLike } from "@studio/capability-sdk/server";

export const REVIEW_CONTRACT = "cref_review_loop";

interface InstanceLike {
  instance_id: string;
  state: string;
  revision: number;
  contract_ref_id: string;
  metadata: { review?: Record<string, unknown> } & Record<string, unknown>;
}

interface SessionJson {
  protocol_version: "1";
  session_key: string;
  view: "app" | "components" | "foundations";
  review_round: number;
  round_state: string;
  convergence: { mode: string };
  target: { view: "app" | "components" | "foundations"; url?: string; proxy_port?: number | null };
  threads: Record<string, Array<Record<string, unknown>>>;
  created_at: string;
  updated_at: string;
}

function toSessionJson(instance: InstanceLike): SessionJson {
  const review = (instance.metadata.review ?? {}) as Record<string, unknown>;
  const target = (review.target ?? { view: review.view ?? "app" }) as SessionJson["target"];
  return {
    protocol_version: "1",
    session_key: instance.instance_id,
    view: (review.view as SessionJson["view"]) ?? "app",
    review_round: (review.review_round as number) ?? 1,
    round_state: instance.state,
    convergence: (review.convergence as SessionJson["convergence"]) ?? { mode: "unresolved_zero" },
    target,
    threads: (review.threads as SessionJson["threads"]) ?? {},
    created_at: (review.created_at as string) ?? new Date().toISOString(),
    updated_at: (review.updated_at as string) ?? new Date().toISOString(),
  };
}

function unresolvedCount(session: SessionJson): number {
  let count = 0;
  for (const comments of Object.values(session.threads)) {
    for (const c of comments) {
      if (!c.resolved) count++;
    }
  }
  return count;
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase();
}

class ReviewHandler {
  constructor(
    private readonly hub: CapabilityServerContext["hub"],
    private readonly actorId: string,
    private readonly contractRefId: string,
  ) {}

  private provenance(instanceId?: string) {
    return { instance_id: instanceId, actor_id: this.actorId, token_id: "worker" };
  }

  async createSession(input: {
    title?: string;
    view?: SessionJson["view"];
    url?: string;
    assigned_reviewer?: string;
  }): Promise<SessionJson> {
    const ts = new Date().toISOString();
    const result = await this.hub.execute({
      kind: "instance.create",
      provenance: this.provenance(),
      contract_ref_id: this.contractRefId,
      metadata: {
        title: input.title,
        assigned_reviewer: input.assigned_reviewer,
        review: {
          view: input.view ?? "app",
          review_round: 1,
          target: { view: input.view ?? "app", url: input.url },
          threads: {},
          created_at: ts,
          updated_at: ts,
        },
      },
    });
    if (result.outcome !== "success") throw new Error(JSON.stringify(result.body));
    return this.getSession(result.body!.instance_id as string);
  }

  async getSession(sessionKey: string): Promise<SessionJson> {
    const instance = (await this.hub.query("instance.get", { instance_id: sessionKey })) as InstanceLike | null;
    if (!instance) throw new Error("SESSION_NOT_FOUND");
    return toSessionJson(instance);
  }

  async addComment(
    sessionKey: string,
    input: { thread: string; scope?: string; body: string; author?: string; anchor?: unknown },
  ): Promise<SessionJson> {
    const session = await this.getSession(sessionKey);
    const inst = (await this.hub.query("instance.get", { instance_id: sessionKey })) as InstanceLike;
    const ts = new Date().toISOString();
    const comment = {
      id: newId(),
      scope: input.scope ?? "general",
      body: input.body,
      author: input.author ?? "Human",
      resolved: false,
      anchor: input.anchor ?? null,
      replies: [],
      created_at: ts,
    };
    const threads = { ...session.threads };
    threads[input.thread] = [...(threads[input.thread] ?? []), comment];
    await this.hub.execute({
      kind: "instance.metadata.patch",
      provenance: this.provenance(sessionKey),
      patch: { review: { threads, updated_at: ts } },
      expected_revision: inst.revision,
    });
    return this.getSession(sessionKey);
  }

  async finish(sessionKey: string): Promise<SessionJson> {
    const inst = (await this.hub.query("instance.get", { instance_id: sessionKey })) as InstanceLike;
    const result = await this.hub.execute({
      kind: "state.transition",
      provenance: this.provenance(sessionKey),
      event: "finish_review",
      expected_revision: inst.revision,
    });
    if (result.outcome !== "success" && result.http_semantic !== 202) {
      throw new Error(JSON.stringify(result.body));
    }
    return this.getSession(sessionKey);
  }

  async reviewCycle(sessionKey: string, timeoutMs = 300_000) {
    const session = await this.getSession(sessionKey);
    if (session.round_state === "converged" || session.round_state === "production_approved") {
      return this.buildCycleResponse(session);
    }

    const reg = await this.hub.execute({
      kind: "wait.register",
      provenance: this.provenance(sessionKey),
      condition: { type: "state", state: "awaiting_agent", op: "eq" },
      delivery_mode: "in_process",
    });
    const waitId = reg.body?.wait_id as string | undefined;
    if (!waitId) throw new Error("WAIT_REGISTER_FAILED");

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const poll = (await this.hub.query("wait.poll", { wait_id: waitId })) as { status: string };
      if (poll.status === "matched") return this.buildCycleResponse(await this.getSession(sessionKey));
      if (poll.status === "cancelled" || poll.status === "denied") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    return { status: "timeout", session_key: sessionKey };
  }

  private buildCycleResponse(session: SessionJson) {
    const comments = Object.values(session.threads).flat().map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author,
      scope: c.scope,
      anchor: c.anchor,
      replies: (c.replies as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        body: r.body,
        author: r.author,
      })),
    }));
    const unresolved = unresolvedCount(session);
    return {
      status: "finished",
      approved: unresolved === 0,
      session_key: session.session_key,
      session_id: session.session_key,
      round: session.review_round,
      round_state: session.round_state,
      comments,
      stats: { unresolved },
    };
  }
}

type RouteCtx = {
  hub: CapabilityServerContext["hub"];
  req: {
    param: (n: string) => string;
    json: () => Promise<unknown>;
  };
  json: (v: unknown, status?: number) => unknown;
};

export function mountRoutes(app: HonoLike, ctx: CapabilityServerContext): void {
  const contractRef = ctx.contractRefId;

  function rh(c: RouteCtx) {
    return new ReviewHandler(c.hub, "actor_reviewer", contractRef);
  }

  app.get("/health", (c) => (c as RouteCtx).json({ ok: true, package: ctx.packageId, version: ctx.version }));

  app.post("/sessions", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json()) as Record<string, unknown>;
    const session = await rh(cc).createSession({
      title: body.title as string | undefined,
      view: body.view as SessionJson["view"] | undefined,
      url: body.url as string | undefined,
      assigned_reviewer: body.assigned_reviewer as string | undefined,
    });
    return cc.json(session, 201);
  });

  app.get("/sessions", async (c) => {
    const cc = c as RouteCtx;
    const instances = (await ctx.hub.query("instance.list", {})) as InstanceLike[];
    return cc.json(
      instances
        .filter((i) => i.contract_ref_id === contractRef)
        .map((i) => {
          const s = toSessionJson(i);
          return {
            session_key: s.session_key,
            view: s.view,
            review_round: s.review_round,
            round_state: s.round_state,
            unresolved: unresolvedCount(s),
            created_at: s.created_at,
            updated_at: s.updated_at,
          };
        }),
    );
  });

  app.get("/sessions/:key", async (c) => {
    const cc = c as RouteCtx;
    try {
      return cc.json(await rh(cc).getSession(cc.req.param("key")));
    } catch {
      return cc.json({ code: "SESSION_NOT_FOUND" }, 404);
    }
  });

  app.post("/sessions/:key/comments", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json()) as Record<string, unknown>;
    try {
      return cc.json(
        await rh(cc).addComment(cc.req.param("key"), {
          thread: String(body.thread ?? ""),
          scope: body.scope as string | undefined,
          body: String(body.body ?? ""),
          author: body.author as string | undefined,
          anchor: body.anchor,
        }),
        201,
      );
    } catch {
      return cc.json({ code: "SESSION_NOT_FOUND" }, 404);
    }
  });

  app.post("/sessions/:key/finish", async (c) => {
    const cc = c as RouteCtx;
    try {
      const session = await rh(cc).finish(cc.req.param("key"));
      const unresolved = unresolvedCount(session);
      return cc.json({
        status: "finished",
        approved: unresolved === 0,
        session_id: session.session_key,
        round: session.review_round,
        stats: { unresolved },
      });
    } catch {
      return cc.json({ code: "SESSION_NOT_FOUND" }, 404);
    }
  });

  app.post("/sessions/:key/wait", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json().catch(() => ({}))) as { timeout_ms?: number };
    try {
      return cc.json(await rh(cc).reviewCycle(cc.req.param("key"), body.timeout_ms));
    } catch {
      return cc.json({ code: "SESSION_NOT_FOUND" }, 404);
    }
  });

  app.post("/sessions/:key/review-cycle", async (c) => {
    const cc = c as RouteCtx;
    const body = (await cc.req.json().catch(() => ({}))) as { timeout_ms?: number };
    try {
      return cc.json(await rh(cc).reviewCycle(cc.req.param("key"), body.timeout_ms));
    } catch {
      return cc.json({ code: "SESSION_NOT_FOUND" }, 404);
    }
  });
}
