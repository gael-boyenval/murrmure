import { afterEach, describe, expect, it, vi } from "vitest";
import { createShellClient } from "../src/client.js";

describe("directives.eligible", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /v1/directives/eligible", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        spaces: [{ space_id: "spc_app", name: "App", slug: "app", handler_id: "directive" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createShellClient({ baseUrl: "http://hub.test", token: "tok" });
    const body = await client.directives.eligible();

    expect(body.spaces).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.test/v1/directives/eligible",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });
});
