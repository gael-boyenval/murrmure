import type { Hono } from "hono";
import {
  buildMeetingTranscript,
  canReadMeetingTranscript,
  closeMeeting,
  conveneMeeting,
  hasCapability,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { hookDispatchDeps } from "../../hook-dispatch.js";

function denialHttp(http: number): 400 | 403 | 404 | 409 {
  if (http === 403) return 403;
  if (http === 409) return 409;
  if (http === 404) return 404;
  return 400;
}

export function mountMeetingRoutes(app: Hono, ctx: DaemonContext): void {
  const { murrmurePersistence } = ctx;

  app.post("/v1/meetings", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const flowCheck = requireCapability(auth, "flow:run", effective);
    if (flowCheck) return flowCheck;
    const readCheck = requireCapability(auth, "space:read", effective);
    if (readCheck) return readCheck;

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const participants = Array.isArray(body.participants) ? body.participants : [];
    const result = await conveneMeeting(hookDispatchDeps(ctx), {
      title: String(body.title ?? "Meeting"),
      goal: typeof body.goal === "string" ? body.goal : undefined,
      session_id: typeof body.session_id === "string" ? body.session_id : undefined,
      participants: participants as Array<{ space_id: string; persona?: string }>,
      chair: (body.chair ?? { human: true }) as { human: true } | { space_id: string; persona?: string },
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      convenor_space_id: auth.space_id === "bootstrap" ? undefined : auth.space_id,
    });
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, denialHttp(result.http));
    }
    return c.json(result, 201);
  });

  app.get("/v1/sessions/:session_id/transcript", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const session_id = c.req.param("session_id");
    const rawSince = c.req.query("since_seq");
    const since_seq = rawSince != null && rawSince !== "" ? Number(rawSince) : 0;
    const transcript = await buildMeetingTranscript(murrmurePersistence, {
      session_id,
      since_seq: Number.isFinite(since_seq) ? since_seq : 0,
    });
    if (!transcript) {
      return c.json({ code: "MEETING_NOT_FOUND", message: "No meeting on this session" }, 404);
    }
    if (
      !canReadMeetingTranscript({
        token_space_id: auth.space_id,
        capabilities: effective,
        roster: transcript.roster,
      })
    ) {
      return c.json(
        {
          code: "SCOPE_ENFORCEMENT_FAILURE",
          message: "Transcript requires a roster space or journal:read on a roster space",
        },
        403,
      );
    }
    return c.json(transcript);
  });

  app.post("/v1/sessions/:session_id/meeting/close", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const session_id = c.req.param("session_id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const bootstrap = auth.space_id === "bootstrap" || hasCapability(effective, "hub:admin");
    const result = await closeMeeting(hookDispatchDeps(ctx), {
      session_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      human: true,
      bootstrap,
      convenor_space_id: auth.space_id === "bootstrap" ? undefined : auth.space_id,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      outcome: typeof body.outcome === "string" ? body.outcome : undefined,
      artifacts: Array.isArray(body.artifacts) ? (body.artifacts as string[]) : undefined,
      failed: body.failed === true,
    });
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, denialHttp(result.http));
    }
    return c.json(result);
  });
}
