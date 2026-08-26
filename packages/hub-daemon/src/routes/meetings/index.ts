import type { Hono } from "hono";
import {
  buildMeetingTranscript,
  canReadMeetingTranscript,
  closeMeeting,
  conveneMeeting,
  emitAndDeliver,
  hasCapability,
  meetingRosterTouchesSpace,
  resumeMeeting,
  sortMeetingList,
  toMeetingListRow,
} from "@murrmure/hub-core";
import type { DaemonContext } from "../../context.js";
import { requireToken } from "../../auth.js";
import { requireCapability, resolveTokenCapabilities } from "../config/scopes.js";
import { hookDispatchDeps } from "../../hook-dispatch.js";
import { broadcastSse } from "../../context.js";

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
      capabilities: effective,
    });
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, denialHttp(result.http));
    }
    return c.json(result, 201);
  });

  app.get("/v1/meetings", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const readCheck = requireCapability(auth, "space:read", effective);
    if (readCheck) return readCheck;

    const listed = await murrmurePersistence.listMeetings();
    const bootstrap = auth.space_id === "bootstrap" || hasCapability(effective, "hub:admin");
    const visible = bootstrap
      ? listed
      : listed.filter((row) => meetingRosterTouchesSpace(row, auth.space_id));
    return c.json({
      meetings: sortMeetingList(visible.map((row) => toMeetingListRow(row))),
    });
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

  app.get("/v1/sessions/:session_id/artifacts/:transfer_id", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const session_id = c.req.param("session_id");
    const transfer_id = c.req.param("transfer_id");
    const transcript = await buildMeetingTranscript(murrmurePersistence, { session_id, since_seq: 0 });
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
    const referenced = transcript.messages.some((message) => message.artifacts?.includes(transfer_id));
    if (!referenced) {
      return c.json(
        { code: "ARTIFACT_NOT_IN_MEETING", message: "This artifact is not attached to the meeting" },
        404,
      );
    }
    const result = await ctx.artifactService.getMeetingArtifact({
      transfer_id,
      preview: c.req.query("preview") === "1" || c.req.query("preview") === "true",
    });
    return c.json(result.body, result.http);
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

  app.post("/v1/sessions/:session_id/meeting/resume", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const session_id = c.req.param("session_id");
    const bootstrap = auth.space_id === "bootstrap" || hasCapability(effective, "hub:admin");
    const result = await resumeMeeting(hookDispatchDeps(ctx), {
      session_id,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      human: true,
      bootstrap,
      convenor_space_id: auth.space_id === "bootstrap" ? undefined : auth.space_id,
      capabilities: effective,
    });
    if (!result.ok) {
      return c.json({ code: result.code, message: result.message }, denialHttp(result.http));
    }
    return c.json(result);
  });

  app.post("/v1/sessions/:session_id/meeting/say", async (c) => {
    const auth = await requireToken(murrmurePersistence, c.req.raw);
    if (auth instanceof Response) return auth;
    const effective = await resolveTokenCapabilities(murrmurePersistence, auth);
    const readCheck = requireCapability(auth, "space:read", effective);
    if (readCheck) return readCheck;
    const session_id = c.req.param("session_id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const bootstrap = auth.space_id === "bootstrap" || hasCapability(effective, "hub:admin");
    const space_id =
      auth.space_id === "bootstrap" ? ctx.config.defaultSpaceId : auth.space_id;
    const emitted = await emitAndDeliver(hookDispatchDeps(ctx), {
      space_id,
      event_type: "mrmr.meeting.said",
      session_id,
      payload: body,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      human_chair: true,
      bootstrap,
    });
    if (!emitted.ok) {
      return c.json({ code: emitted.code, message: emitted.message }, denialHttp(emitted.http));
    }
    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: emitted.type,
        space_id,
        session_id,
        event_id: emitted.event_id,
        seq: emitted.seq,
      },
    });
    return c.json({ ok: true, event_id: emitted.event_id, seq: emitted.seq });
  });
}
