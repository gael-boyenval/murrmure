import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as clack from "@clack/prompts";
import { clearAuthContextCache } from "../../src/lib/auth-context.js";
import { setupCommand } from "../../src/commands/setup.js";
import { spaceSetupCommand } from "../../src/commands/space/setup.js";
import { AGENT_GRANT_CAPABILITIES, AGENT_GRANT_CAPABILITIES_CSV } from "../../src/wizard/capabilities.js";
import { buildMcpConfigSnippet } from "../../src/lib/space-doctor-mcp.js";
import { buildOnboardJsonPlan, buildSetupJsonPlan } from "../../src/wizard/json.js";
import {
  wizardMintAgentGrant,
  type WizardGrantResult,
} from "../../src/wizard/grant.js";
import {
  wizardSpaceApply,
  wizardSpaceInit,
  wizardSpaceLink,
  wizardSpaceStatus,
} from "../../src/wizard/space-ops.js";

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

describe("wizard capabilities", () => {
  test("AGENT_GRANT_CAPABILITIES uses rev-1 scopes not v1 WORKER_SCOPES", () => {
    expect(AGENT_GRANT_CAPABILITIES).toContain("flow:run");
    expect(AGENT_GRANT_CAPABILITIES).toContain("gate:resolve");
    expect(AGENT_GRANT_CAPABILITIES).not.toContain("state:transition");
    expect(AGENT_GRANT_CAPABILITIES).not.toContain("event:emit");
    expect(AGENT_GRANT_CAPABILITIES_CSV).toContain("action:invoke");
  });
});

describe("wizard json plans", () => {
  test("buildSetupJsonPlan lists connect through grant steps", () => {
    const plan = buildSetupJsonPlan();
    expect(plan.wizard).toBe("setup");
    expect(plan.steps.map((step) => step.id)).toEqual([
      "connect",
      "spaces",
      "init",
      "link",
      "apply",
      "skill",
      "grant",
    ]);
  });

  test("buildOnboardJsonPlan lists link apply status", () => {
    const plan = buildOnboardJsonPlan({ yes: true });
    expect(plan.wizard).toBe("onboard");
    expect(plan.interactive).toBe(false);
    expect(plan.steps.map((step) => step.id)).toEqual(["link", "apply", "status"]);
  });
});

describe("wizard space ops", () => {
  const envSnapshot = { ...process.env };
  let projectDir: string;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_admin";
    clearAuthContextCache();
    projectDir = mkdtempSync(join(tmpdir(), "cli-wizard-"));
    const root = join(projectDir, "murrmure");
    mkdirSync(join(root, "flows", "example"), { recursive: true });
    writeFileSync(
      join(root, "actions.yaml"),
      "version: 1\nactions:\n  hello:\n    executor: shell\n",
    );
    writeFileSync(
      join(root, "executors.yaml"),
      "executors: {}\n",
    );
    writeFileSync(
      join(root, "hooks.yaml"),
      "version: 1\nhooks: {}\n",
    );
    writeFileSync(
      join(root, "space.yaml"),
      "slug: wizard-smoke\nname: Wizard Smoke\n",
    );
    writeFileSync(
      join(root, "flows", "example", "flow.manifest.yaml"),
      "apiVersion: murrmure.flow/v1\nname: example\nstart:\n  manual: true\nsteps: []\n",
    );
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("wizardSpaceInit scaffolds murrmure/ in empty directory", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "cli-wizard-empty-"));
    try {
      const result = await wizardSpaceInit(emptyDir, { withSkill: false });
      expect(result.created.length).toBeGreaterThan(0);
      expect(result.skill_installed).toBe(false);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test("wizardSpaceLink apply status smoke with mocked hub", async () => {
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
              spaces: [],
            }),
          };
        }
        if (String(url).endsWith("/v1/spaces") && method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ space_id: "spc_wizard", slug: "wizard-smoke" }),
          };
        }
        if (String(url).includes("/link") && method === "POST") {
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        if (String(url).includes("/apply") && method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, counts: { flows: 1, actions: 1, hooks: 0, executors: 1 } }),
          };
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
        if (String(url).includes("/grants") && method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              grant_id: "grt_wizard",
              token: "tok_wizard_agent",
              scopes: AGENT_GRANT_CAPABILITIES,
            }),
          };
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      }),
    );

    const link = await wizardSpaceLink(
      { json: false },
      projectDir,
      { spaceId: "spc_wizard" },
    );
    expect(link.space_id).toBe("spc_wizard");

    const applyBody = await wizardSpaceApply({ json: false }, projectDir, "spc_wizard");
    expect(applyBody.ok).toBe(true);

    const status = await wizardSpaceStatus({ json: false }, projectDir, "spc_wizard");
    expect(status.counts.flows).toBe(1);
  });

  test("wizardMintAgentGrant returns MCP snippet with v2 capabilities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/grants") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { scopes: string[] };
          expect(body.scopes).toEqual([...AGENT_GRANT_CAPABILITIES]);
          return {
            ok: true,
            status: 201,
            json: async () => ({
              grant_id: "grt_test",
              token: "tok_agent",
              scopes: body.scopes,
            }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const grant: WizardGrantResult = await wizardMintAgentGrant(
      { hubUrl: "http://127.0.0.1:8787", token: "tok_admin" },
      "spc_wizard",
    );
    expect(grant.token).toBe("tok_agent");
    expect(grant.mcp_snippet).toContain("MURRMURE_HUB_TOKEN");
    expect(grant.mcp_snippet).toContain("tok_agent");
    expect(buildMcpConfigSnippet({ token: "tok_agent" })).toContain(
      "murrmure",
    );
  });
});

describe("clack confirm helper", () => {
  test("confirmStep returns true when --yes", async () => {
    const { confirmStep } = await import("../../src/wizard/interactive.js");
    const result = await confirmStep("Skip?", { yes: true });
    expect(result).toBe(true);
    expect(clack.confirm).not.toHaveBeenCalled();
  });
});

function stubWizardHubFetch(projectDir: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (String(url).endsWith("/v1/auth/whoami")) {
        const adminScopes = ["hub:admin", "space:admin", "space:write", "space:read"];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "actor_admin",
            kind: "human",
            token_id: "tok_admin",
            spaces: [
              { space_id: "spc_linked", scopes: adminScopes },
              { space_id: "spc_created", scopes: adminScopes },
            ],
          }),
        };
      }
      if (String(url).endsWith("/v1/spaces") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ space_id: "spc_created", slug: "my-space" }),
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
      if (String(url).includes("/grants") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            grant_id: "grt_wizard",
            token: "tok_wizard_agent",
            scopes: AGENT_GRANT_CAPABILITIES,
          }),
        };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }),
  );
}

describe("setup --yes --json", () => {
  const envSnapshot = { ...process.env };
  let projectDir: string;
  let stdout: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_admin";
    clearAuthContextCache();
    stdout = "";
    exitCode = undefined;
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      stdout += `${line}\n`;
    });
    vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit:${code ?? 0}`);
    });

    projectDir = mkdtempSync(join(tmpdir(), "cli-setup-json-"));
    stubWizardHubFetch(projectDir);
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearAuthContextCache();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("desktop_handoff uses indexed flow id from murrmure/", async () => {
    const root = join(projectDir, "murrmure");
    mkdirSync(join(root, "flows", "example"), { recursive: true });
    writeFileSync(join(root, "actions.yaml"), "version: 1\nactions:\n  hello:\n    executor: shell\n");
    writeFileSync(join(root, "executors.yaml"), "executors: {}\n");
    writeFileSync(join(root, "hooks.yaml"), "version: 1\nhooks: {}\n");
    writeFileSync(join(root, "space.yaml"), "slug: setup-smoke\nname: Setup Smoke\n");
    writeFileSync(
      join(root, "flows", "example", "flow.manifest.yaml"),
      "apiVersion: murrmure.flow/v1\nname: example\nstart:\n  manual: true\nsteps: []\n",
    );

    await (setupCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: projectDir, yes: true, json: true, space: "spc_linked" },
      rawArgs: [],
    });

    const payload = JSON.parse(stdout.trim()) as {
      ok: boolean;
      desktop_handoff?: { flow_id?: string; space_id: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.desktop_handoff?.flow_id).toBe("flw_flows_example");
    expect(payload.desktop_handoff?.space_id).toBe("spc_created");
  });

  test("desktop_handoff omits flow_id when no flows indexed", async () => {
    const root = join(projectDir, "murrmure");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "actions.yaml"), "version: 1\nactions:\n  hello:\n    executor: shell\n");
    writeFileSync(join(root, "executors.yaml"), "executors: {}\n");
    writeFileSync(join(root, "hooks.yaml"), "version: 1\nhooks: {}\n");
    writeFileSync(join(root, "space.yaml"), "slug: setup-smoke\nname: Setup Smoke\n");

    await (setupCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: projectDir, yes: true, json: true, space: "spc_linked" },
      rawArgs: [],
    });

    const payload = JSON.parse(stdout.trim()) as {
      desktop_handoff?: { flow_id?: string };
    };
    expect(payload.desktop_handoff?.flow_id).toBeUndefined();
  });

  test("records init failure on init step not apply", async () => {
    const initSpy = vi.spyOn(await import("../../src/wizard/space-ops.js"), "wizardSpaceInit").mockRejectedValueOnce(
      new Error("init failed"),
    );

    try {
      await (setupCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { path: projectDir, yes: true, json: true },
        rawArgs: [],
      });
    } catch (error) {
      expect(String(error)).toContain("process.exit:1");
    }

    const payload = JSON.parse(stdout.trim()) as {
      ok: boolean;
      steps: Array<{ id: string; ok: boolean; skipped?: boolean }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.steps.find((step) => step.id === "init")?.ok).toBe(false);
    expect(payload.steps.find((step) => step.id === "link")?.skipped).toBe(true);
    expect(payload.steps.find((step) => step.id === "apply")?.skipped).toBe(true);
    expect(exitCode).toBe(1);
    initSpy.mockRestore();
  });

  test("records link failure on link step not apply", async () => {
    const linkSpy = vi.spyOn(await import("../../src/wizard/space-ops.js"), "wizardSpaceLink").mockRejectedValueOnce(
      new Error("link failed"),
    );

    try {
      await (setupCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { path: projectDir, yes: true, json: true, space: "spc_linked" },
        rawArgs: [],
      });
    } catch (error) {
      expect(String(error)).toContain("process.exit:1");
    }

    const payload = JSON.parse(stdout.trim()) as {
      ok: boolean;
      space_id?: string;
      desktop_handoff?: unknown;
      steps: Array<{ id: string; ok: boolean; skipped?: boolean; error?: { code: string } }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.steps.find((step) => step.id === "init")?.ok).toBe(true);
    expect(payload.steps.find((step) => step.id === "link")?.ok).toBe(false);
    expect(payload.steps.find((step) => step.id === "apply")?.skipped).toBe(true);
    expect(payload.space_id).toBeUndefined();
    expect(payload.desktop_handoff).toBeUndefined();
    expect(payload.steps.find((step) => step.id === "grant")).toBeUndefined();
    linkSpy.mockRestore();
  });

  test("does not mint grant or print handoff when link fails", async () => {
    let grantMinted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (String(url).endsWith("/v1/auth/whoami")) {
          const adminScopes = ["hub:admin", "space:admin", "space:write", "space:read"];
          return {
            ok: true,
            status: 200,
            json: async () => ({
              actor_id: "actor_admin",
              kind: "human",
              token_id: "tok_admin",
              spaces: [{ space_id: "spc_created", scopes: adminScopes }],
            }),
          };
        }
        if (String(url).endsWith("/v1/spaces") && method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ space_id: "spc_created", slug: "ui-sandbox" }),
          };
        }
        if (String(url).includes("/grants") && method === "POST") {
          grantMinted = true;
          return {
            ok: true,
            status: 201,
            json: async () => ({
              grant_id: "grt_should_not_mint",
              token: "tok_should_not_mint",
              scopes: AGENT_GRANT_CAPABILITIES,
            }),
          };
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      }),
    );

    const linkSpy = vi.spyOn(await import("../../src/wizard/space-ops.js"), "wizardSpaceLink").mockRejectedValueOnce(
      new Error("link failed"),
    );
    const handoffSpy = vi.spyOn(await import("../../src/wizard/outro.js"), "printDesktopHandoff");

    try {
      await (setupCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { path: projectDir, yes: true },
        rawArgs: [],
      });
    } catch (error) {
      expect(String(error)).toContain("process.exit:1");
    }

    expect(grantMinted).toBe(false);
    expect(handoffSpy).not.toHaveBeenCalled();
    linkSpy.mockRestore();
    handoffSpy.mockRestore();
  });

  test("records apply failure on apply step", async () => {
    const root = join(projectDir, "murrmure");
    mkdirSync(join(root, "flows", "example"), { recursive: true });
    writeFileSync(join(root, "actions.yaml"), "version: 1\nactions:\n  hello:\n    executor: shell\n");
    writeFileSync(join(root, "executors.yaml"), "executors: {}\n");
    writeFileSync(join(root, "hooks.yaml"), "version: 1\nhooks: {}\n");
    writeFileSync(join(root, "space.yaml"), "slug: setup-smoke\nname: Setup Smoke\n");
    writeFileSync(
      join(root, "flows", "example", "flow.manifest.yaml"),
      "apiVersion: murrmure.flow/v1\nname: example\nstart:\n  manual: true\nsteps: []\n",
    );

    const applySpy = vi
      .spyOn(await import("../../src/wizard/space-ops.js"), "wizardSpaceApply")
      .mockRejectedValueOnce(new Error("apply failed"));

    try {
      await (setupCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { path: projectDir, yes: true, json: true, space: "spc_linked" },
        rawArgs: [],
      });
    } catch (error) {
      expect(String(error)).toContain("process.exit:1");
    }

    const payload = JSON.parse(stdout.trim()) as {
      ok: boolean;
      steps: Array<{ id: string; ok: boolean }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.steps.find((step) => step.id === "apply")?.ok).toBe(false);
    applySpy.mockRestore();
  });
});

describe("space setup grant mint", () => {
  const envSnapshot = { ...process.env };
  let projectDir: string;
  let grantSpaceId: string | undefined;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_admin";
    clearAuthContextCache();
    grantSpaceId = undefined;

    projectDir = mkdtempSync(join(tmpdir(), "cli-space-setup-grant-"));
    const root = join(projectDir, "murrmure");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "actions.yaml"), "version: 1\nactions:\n  hello:\n    executor: shell\n");
    writeFileSync(join(root, "executors.yaml"), "executors: {}\n");
    writeFileSync(join(root, "hooks.yaml"), "version: 1\nhooks: {}\n");
    writeFileSync(join(root, "space.yaml"), "slug: grant-smoke\nname: Grant Smoke\n");

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
                  space_id: "spc_from_link",
                  scopes: ["hub:admin", "space:admin", "space:write", "space:read"],
                },
              ],
            }),
          };
        }
        if (String(url).endsWith("/v1/spaces") && method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ space_id: "spc_should_not_mint", slug: "ui-sandbox" }),
          };
        }
        if (String(url).includes("/link") && method === "POST") {
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        if (String(url).includes("/apply") && method === "POST") {
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        if (String(url).includes("/grants") && method === "POST") {
          const match = String(url).match(/\/v1\/spaces\/([^/]+)\/grants/);
          grantSpaceId = match?.[1];
          return {
            ok: true,
            status: 201,
            json: async () => ({
              grant_id: "grt_space_setup",
              token: "tok_agent",
              scopes: AGENT_GRANT_CAPABILITIES,
            }),
          };
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("mints grant for linked space id not first created space", async () => {
    const createSpy = vi.spyOn(await import("../../src/commands/space/commands.js"), "createSpaceOnHub");
    const linkSpy = vi.spyOn(await import("../../src/wizard/space-ops.js"), "wizardSpaceLink").mockResolvedValueOnce({
      space_id: "spc_from_link",
      created: false,
    });

    await (spaceSetupCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: projectDir, yes: true },
      rawArgs: [],
    });

    expect(grantSpaceId).toBe("spc_from_link");
    expect(grantSpaceId).not.toBe("spc_should_not_mint");
    createSpy.mockRestore();
    linkSpy.mockRestore();
  });
});
