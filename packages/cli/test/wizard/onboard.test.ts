import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clearAuthContextCache } from "../../src/lib/auth-context.js";
import { spaceOnboardCommand } from "../../src/commands/space/onboard.js";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { success: vi.fn(), info: vi.fn(), warn: vi.fn() },
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: (value: unknown) => value === Symbol.for("clack:cancel"),
  confirm: vi.fn(),
  text: vi.fn(),
  password: vi.fn(),
}));

describe("space onboard --yes --json", () => {
  const envSnapshot = { ...process.env };
  let projectDir: string;
  let stdout: string;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_admin";
    clearAuthContextCache();
    stdout = "";
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      stdout += `${line}\n`;
    });

    projectDir = mkdtempSync(join(tmpdir(), "cli-onboard-"));
    const root = join(projectDir, ".mrmr");
    mkdirSync(join(root, "space"), { recursive: true });
    mkdirSync(join(root, "flows", "example"), { recursive: true });
    writeFileSync(
      join(root, "space", "handlers.yaml"),
      [
        "version: 1",
        "handlers:",
        "  - id: hello",
        "    contract_keys: [example.hello]",
        "    on: step.opened",
        "    type: shell_spawn",
        "    complete: explicit",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "space", "space.yaml"),
      "apiVersion: murrmure.space/v1\nslug: onboard-smoke\nname: Onboard Smoke\n",
    );
    writeFileSync(
      join(root, "flows", "example", "flow.manifest.yaml"),
      [
        "apiVersion: murrmure.flow/v1",
        "name: example",
        "start:",
        "  manual: true",
        "steps:",
        "  - id: hello",
        "    role: agent",
        "    branches:",
        "      completed:",
        "        schema: { type: object }",
        "        next: null",
        "",
      ].join("\n"),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (String(url).endsWith("/v1/auth/whoami")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              actor_id: "actor_admin",
              kind: "human",
              token_id: "tok_admin",
              spaces: [
                {
                  space_id: "spc_onboard",
                  scopes: ["hub:admin", "space:admin", "space:write", "space:read"],
                },
              ],
            }),
          };
        }
        if (String(url).includes("/link") && method === "POST") {
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        if (String(url).includes("/apply") && method === "POST") {
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        if (String(url).includes("/index/status")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              counts: { flows: 1, actions: 1, hooks: 0, executors: 1 },
              bindings: [{ host: "local", path: projectDir }],
            }),
          };
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearAuthContextCache();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("completes link apply status with flows>=1", async () => {
    await (spaceOnboardCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: projectDir, yes: true, json: true, space: "spc_onboard" },
      rawArgs: [],
    });

    const payload = JSON.parse(stdout.trim()) as {
      ok: boolean;
      space_id: string;
      steps: Array<{ id: string; ok: boolean; detail?: { counts?: { flows: number } } }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.space_id).toBe("spc_onboard");
    const statusStep = payload.steps.find((step) => step.id === "status");
    expect(statusStep?.detail?.counts?.flows).toBeGreaterThanOrEqual(1);
  });

  test("desktop_handoff uses hub URL from credentials not hardcoded localhost", async () => {
    process.env.MURRMURE_HUB_URL = "http://hub.example:9999";
    clearAuthContextCache();

    await (spaceOnboardCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: projectDir, yes: true, json: true, space: "spc_onboard" },
      rawArgs: [],
    });

    const payload = JSON.parse(stdout.trim()) as {
      desktop_handoff?: { hub_url: string; space_id: string };
    };
    expect(payload.desktop_handoff?.hub_url).toBe("http://hub.example:9999");
    expect(payload.desktop_handoff?.hub_url).not.toBe("http://127.0.0.1:8787");
    expect(payload.desktop_handoff?.space_id).toBe("spc_onboard");
  });
});
