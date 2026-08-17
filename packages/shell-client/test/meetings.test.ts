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
});
