import { afterEach, describe, expect, it, vi } from "vitest";
import { createShellClient } from "../src/client.js";

describe("artifacts.get", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /v1/artifacts/:id with space_id and preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        artifact: { transfer_id: "xfr_1", name: "note.md", size_bytes: 4, digest: "sha256:x" },
        preview: { text: "hi", truncated: false, name: "note.md" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const body = await client.artifacts.get("xfr_1", { space_id: "spc_app", preview: true });

    expect(body.preview?.text).toBe("hi");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/artifacts/xfr_1?space_id=spc_app&preview=1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("GETs session-scoped meeting artifact preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        artifact: { transfer_id: "xfr_1", name: "note.md", size_bytes: 4, digest: "sha256:x" },
        preview: { text: "hi", truncated: false, name: "note.md" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    await client.sessions.getMeetingArtifact("ses_room", "xfr_1", { preview: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/sessions/ses_room/artifacts/xfr_1?preview=1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });
});
