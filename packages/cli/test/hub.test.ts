import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderUsage } from "citty";
import {
  hubCommand,
  hubFederationCommand,
  hubGrantsExportCommand,
} from "../src/commands/hub.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";

const HUB_LEAVES = [
  { name: "federation", command: hubFederationCommand, requires: "space:admin" },
  { name: "grants-export", command: hubGrantsExportCommand, requires: "space:admin" },
] as const;

describe("hub command help", () => {
  test("hub group usage lists all subcommands", async () => {
    const usage = await renderUsage(hubCommand);
    for (const leaf of HUB_LEAVES) {
      expect(usage).toContain(leaf.name);
    }
  });

  test.each(HUB_LEAVES)("$name --help includes Requires line", async ({ command, requires }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:/);
    expect(usage).toContain(requires);
  });
});

describe("hub grants-export", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_admin";
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("streams export JSON to stdout", async () => {
    const exportBody = JSON.stringify({ grants: [{ grant_id: "grt_1" }] });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_admin",
            kind: "human",
            token_id: "tok_admin",
            spaces: [{ space_id: "spc_ui_sandbox", scopes: ["space:admin"] }],
          }),
        };
      }
      if (url.endsWith("/v1/ops/grants/export")) {
        return {
          ok: true,
          status: 200,
          text: async () => exportBody,
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await (hubGrantsExportCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {},
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/ops/grants/export",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok_admin" }),
      }),
    );

    const stdout = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
    expect(stdout).toContain('"grant_id":"grt_1"');
  });
});
