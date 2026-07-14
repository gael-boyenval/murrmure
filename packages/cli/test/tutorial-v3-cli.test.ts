import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { createTemporaryUserData } from "../../../test-utils/tutorial-v3/helpers.js";
import { setupCommand } from "../src/commands/setup.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";

describe("Tutorial v3 CLI conformance", () => {
  const envSnapshot = { ...process.env };
  const userData = createTemporaryUserData();
  const projectPath = join(userData.root, "My First Project");
  const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];

  beforeEach(() => {
    mkdirSync(projectPath, { recursive: true });
    process.env = {
      ...envSnapshot,
      ...userData.env,
      MURRMURE_HUB_URL: "http://127.0.0.1:8787",
      MURRMURE_HUB_TOKEN: "tok_admin",
    };
    clearAuthContextCache();
    requests.length = 0;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
        requests.push({ url, method, body });
        if (url.endsWith("/v1/auth/whoami")) {
          return new Response(JSON.stringify({
            actor_id: "actor_admin",
            kind: "human",
            token_id: "tok_admin",
            spaces: [{
              space_id: "spc_01JTUTORIALV3SPACE0000000",
              scopes: ["hub:admin", "space:admin", "space:write", "space:read"],
            }],
          }));
        }
        if (url.endsWith("/v1/spaces") && method === "POST") {
          return new Response(JSON.stringify({
            space_id: "spc_01JTUTORIALV3SPACE0000000",
            slug: "my-first-space",
            name: "My First Space",
          }), { status: 201 });
        }
        if (url.endsWith("/link") && method === "POST") {
          return new Response(JSON.stringify({ ok: true }));
        }
        if (url.endsWith("/apply") && method === "POST") {
          return new Response(JSON.stringify({ ok: true, warnings: [] }));
        }
        if (url.endsWith("/index/status")) {
          return new Response(JSON.stringify({
            counts: { flows: 0, handlers: 0, views: 0 },
          }));
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  afterAll(() => userData.cleanup());

  test("Task 01 — setup creates the named empty space", async () => {
    await (setupCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        path: projectPath,
        yes: true,
        json: true,
        name: "My First Space",
        slug: "my-first-space",
      },
      rawArgs: [],
    });

    const createRequest = requests.find(({ url, method }) =>
      url.endsWith("/v1/spaces") && method === "POST"
    );
    expect(createRequest?.body).toMatchObject({
      name: "My First Space",
      slug: "my-first-space",
    });
    expect(requests.some(({ url }) => url.includes("/grants") || url.includes("/connections"))).toBe(false);

    const manifest = parseYaml(
      readFileSync(join(projectPath, ".mrmr", "space", "space.yaml"), "utf-8"),
    ) as { name: string; slug: string; link: { space_id: string } };
    expect(manifest).toMatchObject({
      name: "My First Space",
      slug: "my-first-space",
      link: { space_id: "spc_01JTUTORIALV3SPACE0000000" },
    });
    expect(existsSync(join(projectPath, ".mrmr", "space", "handlers.yaml"))).toBe(true);
    expect(existsSync(join(projectPath, ".mrmr", "flows"))).toBe(false);
    expect(existsSync(join(projectPath, ".cursor", "mcp.json"))).toBe(false);
  });

  test.skip("Task 02 — setup creates and activates one local connection", () => {});
  test.skip("Task 03 — strict apply and run use triggers only", () => {});
  test.skip("Task 09 — capacity and active-run apply errors show blocking IDs", () => {});
});
