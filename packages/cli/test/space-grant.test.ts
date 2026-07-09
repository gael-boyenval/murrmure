import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderUsage } from "citty";

const testHomeRef = { value: "" };

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => testHomeRef.value || actual.homedir(),
  };
});

import { resolveHubAuth } from "../src/auth.js";
import {
  grantCommand,
  grantListCommand,
  grantMintCommand,
  grantUseCommand,
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
  { name: "use", command: grantUseCommand, requires: "none" },
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
  let homeDir: string;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    homeDir = mkdtempSync(join(tmpdir(), "cli-space-grant-home-"));
    testHomeRef.value = homeDir;
    process.env.HOME = homeDir;
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_deploy";
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    testHomeRef.value = "";
    rmSync(homeDir, { recursive: true, force: true });
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

  test("mint posts flow_acl, prints export, and stores token by space", async () => {
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
    expect(stdout).toContain("export MURRMURE_HUB_TOKEN=tok_one_time_secret");
    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
    expect(stderrOutput).toMatch(/will not be shown again/i);
    const storedTokenPath = join(homeDir, ".murrmure", "grants", "spc_ui_sandbox.token");
    expect(existsSync(storedTokenPath)).toBe(true);
    expect(readFileSync(storedTokenPath, "utf-8").trim()).toBe("tok_one_time_secret");
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

  test("mint --write-mcp writes global ~/.cursor/mcp.json thin snippet", async () => {
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
        return {
          ok: true,
          status: 200,
          json: async () => ({
            grant_id: "grt_abc",
            token: "tok_one_time_secret",
            label: "CI deploy",
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await (grantMintCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        space: "spc_ui_sandbox",
        label: "CI deploy",
        "write-mcp": true,
      },
      rawArgs: [],
    });

    const mcpPath = join(homeDir, ".cursor", "mcp.json");
    const snippet = readFileSync(mcpPath, "utf-8");
    expect(snippet).toContain('"command": "murrmure-mcp"');
    expect(snippet).toContain('"MURRMURE_HUB_TOKEN": "${env:MURRMURE_HUB_TOKEN}"');
    expect(snippet).not.toContain("MURRMURE_SPACE_ID");
    expect(snippet).not.toContain('"args"');
  });

  test("mint --local --write-mcp writes project .cursor/mcp.json", async () => {
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
        return {
          ok: true,
          status: 200,
          json: async () => ({
            grant_id: "grt_abc",
            token: "tok_one_time_secret",
            label: "CI deploy",
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const projectDir = mkdtempSync(join(tmpdir(), "cli-grant-local-"));
    const previousCwd = process.cwd();
    process.chdir(projectDir);
    try {
      await (grantMintCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: {
          space: "spc_ui_sandbox",
          label: "CI deploy",
          local: true,
          "write-mcp": true,
        },
        rawArgs: [],
      });
      const localMcpPath = join(projectDir, ".cursor", "mcp.json");
      expect(existsSync(localMcpPath)).toBe(true);
      const globalMcpPath = join(homeDir, ".cursor", "mcp.json");
      expect(existsSync(globalMcpPath)).toBe(false);
    } finally {
      process.chdir(previousCwd);
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe("space grant use", () => {
  const envSnapshot = { ...process.env };
  let homeDir: string;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    homeDir = mkdtempSync(join(tmpdir(), "cli-grant-use-home-"));
    testHomeRef.value = homeDir;
    process.env.HOME = homeDir;
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    testHomeRef.value = "";
    rmSync(homeDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("stores explicit token and updates active pointer", async () => {
    await (grantUseCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        space: "spc_ui_sandbox",
        token: "tok_space_worker",
      },
      rawArgs: [],
    });

    const tokenPath = join(homeDir, ".murrmure", "grants", "spc_ui_sandbox.token");
    const activePath = join(homeDir, ".murrmure", "grants", "active");
    expect(readFileSync(tokenPath, "utf-8").trim()).toBe("tok_space_worker");
    expect(readFileSync(activePath, "utf-8").trim()).toBe("spc_ui_sandbox");

    const resolved = resolveHubAuth({ hubUrl: "http://127.0.0.1:8787" });
    if ("error" in resolved) {
      throw new Error("Expected active grant token to resolve auth");
    }
    expect(resolved.token).toBe("tok_space_worker");
    expect(resolved.defaultSpaceId).toBe("spc_ui_sandbox");
  });

  test("activates an already stored token without --token", async () => {
    const grantsDir = join(homeDir, ".murrmure", "grants");
    mkdirSync(grantsDir, { recursive: true });
    writeFileSync(join(grantsDir, "spc_ui_sandbox.token"), "tok_existing\n");

    await (grantUseCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        space: "spc_ui_sandbox",
      },
      rawArgs: [],
    });

    const activePath = join(grantsDir, "active");
    expect(readFileSync(activePath, "utf-8").trim()).toBe("spc_ui_sandbox");
  });
});
