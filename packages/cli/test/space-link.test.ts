import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spaceLinkCommand } from "../src/commands/space/link.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";

describe("space link --create", () => {
  const envSnapshot = { ...process.env };
  let projectDir: string;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_bootstrap";
    delete process.env.MURRMURE_SPACE_ID;
    clearAuthContextCache();
    projectDir = mkdtempSync(join(tmpdir(), "cli-space-link-"));
    const root = join(projectDir, "murrmure");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "space.yaml"), "slug: my-link-space\n");
    writeFileSync(join(root, "actions.yaml"), "version: 1\nactions:\n  hello:\n    executor: shell\n");
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("link --create mints space before link without requiring --space", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_admin",
            kind: "human",
            token_id: "tok_bootstrap",
            spaces: [],
          }),
        };
      }
      if (url.endsWith("/v1/spaces") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            space_id: "spc_my_link_space",
            slug: "my-link-space",
            name: "my-link-space",
            status: "active",
          }),
        };
      }
      if (url.endsWith("/v1/spaces/spc_my_link_space/link") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { path: string };
        expect(body.path).toBe(projectDir);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            space_id: "spc_my_link_space",
            bindings: [{ host: "local", path: projectDir, primary: true }],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await (spaceLinkCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: projectDir, create: true },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_my_link_space/link",
      expect.objectContaining({ method: "POST" }),
    );
    expect(existsSync(join(projectDir, ".murrmure", "link.json"))).toBe(true);
  });

  test("link --create rejects scoped token without space:admin", async () => {
    process.env.MURRMURE_HUB_TOKEN = "tok_scoped";
    clearAuthContextCache();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("CLI_EXIT");
    }) as never);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_scoped",
            kind: "agent",
            token_id: "tok_scoped",
            spaces: [
              {
                space_id: "spc_existing",
                scopes: ["space:read", "space:write"],
              },
            ],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      (spaceLinkCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { path: projectDir, create: true },
        rawArgs: [],
      }),
    ).rejects.toThrow("CLI_EXIT");

    expect(exit).toHaveBeenCalledWith(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
