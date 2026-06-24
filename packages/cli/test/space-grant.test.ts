import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderUsage } from "citty";
import {
  grantCommand,
  grantListCommand,
  grantMintCommand,
  grantRevokeCommand,
  grantRotateCommand,
} from "../src/commands/space/grant.js";
import {
  memberCommand,
  memberInviteCommand,
  memberListCommand,
  memberRemoveCommand,
  memberRoleCommand,
} from "../src/commands/space/member.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";
import { parseGlobalFlags } from "../src/lib/flags.js";

const GRANT_LEAVES = [
  { name: "list", command: grantListCommand, requires: "space:admin" },
  { name: "mint", command: grantMintCommand, requires: "space:admin" },
  { name: "revoke", command: grantRevokeCommand, requires: "space:admin" },
  { name: "rotate", command: grantRotateCommand, requires: "space:admin" },
] as const;

const MEMBER_LEAVES = [
  { name: "list", command: memberListCommand, requires: "space:admin" },
  { name: "invite", command: memberInviteCommand, requires: "space:admin" },
  { name: "role", command: memberRoleCommand, requires: "space:admin" },
  { name: "remove", command: memberRemoveCommand, requires: "space:admin" },
] as const;

describe("space grant command help", () => {
  test("grant group usage lists all subcommands", async () => {
    const usage = await renderUsage(grantCommand);
    for (const leaf of GRANT_LEAVES) {
      expect(usage).toContain(leaf.name);
    }
  });

  test.each(GRANT_LEAVES)("$name --help includes Requires line", async ({ command, requires }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:/);
    expect(usage).toContain(requires);
  });
});

describe("space member command help", () => {
  test("member group usage lists all subcommands", async () => {
    const usage = await renderUsage(memberCommand);
    for (const leaf of MEMBER_LEAVES) {
      expect(usage).toContain(leaf.name);
    }
  });

  test.each(MEMBER_LEAVES)("$name --help includes Requires line", async ({ command, requires }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:/);
    expect(usage).toContain(requires);
  });
});

describe("space grant mint", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_deploy";
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("flow:install token is denied before mint HTTP with clear scope error", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const stderrLog = vi.spyOn(console, "error").mockImplementation(() => {});
    parseGlobalFlags({ json: false });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe("http://127.0.0.1:8787/v1/auth/whoami");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_1",
            kind: "agent",
            token_id: "tok_deploy",
            spaces: [{ space_id: "spc_ui_sandbox", scopes: ["flow:install"] }],
          }),
        };
      }),
    );

    await expect(
      (grantMintCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: {
          space: "spc_ui_sandbox",
          label: "CI deploy",
        },
        rawArgs: [],
      }),
    ).rejects.toThrow("CLI_EXIT");

    expect(exit).toHaveBeenCalledWith(1);
    const stderrOutput = stderrLog.mock.calls.map((call) => String(call[0])).join("\n");
    expect(stderrOutput).toMatch(/Missing scope: space:admin/);
  });

  test("mint posts flow_acl and prints one-time token in human mode", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
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
      if (url.endsWith("/v1/spaces/spc_ui_sandbox/grants") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body.label).toBe("CI deploy");
        expect(body.flow_acl).toEqual(["review-loop"]);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            grant_id: "grt_abc",
            token: "tok_one_time_secret",
            label: "CI deploy",
            scopes: ["space:read", "state:transition"],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const stdoutLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await (grantMintCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        space: "spc_ui_sandbox",
        label: "CI deploy",
        "flow-acl": "review-loop",
      },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_ui_sandbox/grants",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"flow_acl":["review-loop"]'),
      }),
    );

    const stdout = stdoutLog.mock.calls.map((call) => String(call[0])).join("\n");
    expect(stdout).toContain("tok_one_time_secret");
    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
    expect(stderrOutput).toMatch(/will not be shown again/i);
  });

  test("grant list calls GET /grants", async () => {
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
      if (url.endsWith("/v1/spaces/spc_ui_sandbox/grants")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ grants: [{ grant_id: "grt_1", label: "Worker" }] }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await (grantListCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { json: true, space: "spc_ui_sandbox" },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_ui_sandbox/grants",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok_deploy" }),
      }),
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      ok: boolean;
      grants?: unknown[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.grants).toHaveLength(1);
  });
});
