import { afterEach, describe, expect, it, vi } from "vitest";
import { createShellClient, ShellClientHttpError } from "../src/client.js";

const transcript = {
  session_id: "ses_room",
  status: "open" as const,
  roster: [{ participant_id: "ptc_des", space_id: "spc_app", persona: "designer" }],
  chair: { human: true as const },
  since_seq: 0,
  up_to_seq: 2,
  messages: [],
};

describe("sessions meeting APIs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /v1/sessions/:id/transcript and passes since_seq", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => transcript,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const body = await client.sessions.transcript("ses_room", { since_seq: 12 });

    expect(body).toEqual(transcript);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/sessions/ses_room/transcript?since_seq=12",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("returns null when transcript is 404 (not a meeting)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "MEETING_NOT_FOUND" }),
      }),
    );

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    await expect(client.sessions.transcript("ses_plain")).resolves.toBeNull();
  });

  it("POSTs /v1/sessions/:id/meeting/close", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        session_id: "ses_room",
        status: "closed",
        outcome: "completed",
        close_meeting_seq: 9,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const result = await client.sessions.closeMeeting("ses_room", { reason: "goal reached" });

    expect(result.status).toBe("closed");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/sessions/ses_room/meeting/close",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "goal reached" }),
      }),
    );
  });

  it("POSTs a message as the human chair", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, event_id: "evt_human", seq: 3 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    await client.sessions.sayMeeting("ses_room", {
      to: { participant_ids: ["ptc_des"] },
      text: "Please check this.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/sessions/ses_room/meeting/say",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to: { participant_ids: ["ptc_des"] },
          text: "Please check this.",
        }),
      }),
    );
  });

  it("GETs /v1/spaces/:id/personas", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        personas: [{ id: "designer", summary: "Product design" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const body = await client.spaces.personas("spc_app");

    expect(body.personas).toEqual([{ id: "designer", summary: "Product design" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/spaces/spc_app/personas",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("GETs /v1/meetings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        meetings: [
          {
            session_id: "ses_room",
            title: "API shape",
            status: "open",
            roster_count: 2,
            roster: [
              { space_id: "spc_app", persona: "designer" },
              { space_id: "spc_research", persona: "researcher" },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const result = await client.meetings.list();
    expect(result.meetings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/meetings",
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it("POSTs /v1/meetings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        session_id: "ses_room",
        status: "open",
        title: "API shape",
        chair: { human: true },
        roster: [],
        convene_meeting_seq: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const result = await client.meetings.start({
      title: "API shape",
      goal: "Pick an approach",
      participants: [{ space_id: "spc_app", persona: "designer" }],
      chair: { human: true },
    });

    expect(result.session_id).toBe("ses_room");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/meetings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "API shape",
          goal: "Pick an approach",
          participants: [{ space_id: "spc_app", persona: "designer" }],
          chair: { human: true },
        }),
      }),
    );
  });

  it("raises ShellClientHttpError when convene is denied", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "PERSONA_NOT_FOUND", message: "unknown persona" }),
      }),
    );

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    await expect(
      client.meetings.start({
        title: "API shape",
        participants: [{ space_id: "spc_app", persona: "ghost" }],
        chair: { human: true },
      }),
    ).rejects.toBeInstanceOf(ShellClientHttpError);
  });

  it("raises ShellClientHttpError when close is denied", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "MEETING_CHAIR_REQUIRED", message: "not chair" }),
      }),
    );

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    await expect(client.sessions.closeMeeting("ses_room")).rejects.toBeInstanceOf(ShellClientHttpError);
  });

  it("POSTs /v1/sessions/:id/meeting/resume", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        session_id: "ses_room",
        status: "open",
        resume_meeting_seq: 9,
        roster: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const result = await client.sessions.resumeMeeting("ses_room");
    expect(result.session_id).toBe("ses_room");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/sessions/ses_room/meeting/resume",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
