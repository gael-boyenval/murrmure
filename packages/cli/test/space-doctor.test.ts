import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testHomeRef = { value: "" };

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => testHomeRef.value,
  };
});

import {
  buildSpaceDoctorFixPlan,
  discoverMurrmureProject,
  formatSpaceDoctorHuman,
  runSpaceDoctor,
  scanLegacyWorkspace,
} from "../src/lib/space-doctor.js";

describe("runSpaceDoctor", () => {
  let projectDir: string;
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    delete process.env.MURRMURE_HUB_URL;
    delete process.env.MURRMURE_HUB_TOKEN;
    delete process.env.MURRMURE_TOKEN;
    delete process.env.MURRMURE_SPACE_ID;
    testHomeRef.value = mkdtempSync(join(tmpdir(), "cli-space-doctor-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "cli-space-doctor-"));
    const root = join(projectDir, ".mrmr");
    mkdirSync(join(root, "space"), { recursive: true });
    mkdirSync(join(root, "flows", "demo"), { recursive: true });
    writeFileSync(
      join(root, "space", "space.yaml"),
      [
        "apiVersion: murrmure.space/v1",
        "slug: demo",
        "name: Demo",
        "link:",
        "  space_id: spc_demo",
        "  host: local",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "space", "handlers.yaml"),
      [
        "version: 1",
        "handlers:",
        "  - id: hello",
        "    contract_keys: [demo.hello]",
        "    on: step.opened",
        "    type: shell_spawn",
        "    command: echo hello",
        "    cwd: \"{{space_root}}\"",
        "    complete: explicit",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "flows", "demo", "flow.manifest.yaml"),
      [
        "apiVersion: murrmure.flow/v1",
        "name: demo",
        "triggers:",
        "  manual: true",
        "start:",
        "  manual: true",
        "steps:",
        "  - id: hello",
        "    role: agent",
        "    branches:",
        "      completed:",
        "        schema: { type: object }",
        "        next: null",
        "      failed:",
        "        schema: { type: object }",
        "        next: null",
        "        fail_run: true",
        "",
      ].join("\n"),
    );
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(testHomeRef.value, { recursive: true, force: true });
  });

  test("passes for valid local tree without hub auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/index/status")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              counts: { actions: 1, executors: 0, hooks: 0, flows: 1 },
              digests: {
                actions: undefined,
                flows: [{ flow_id: "flw_flows_demo", digest: "placeholder" }],
              },
              bindings: [{ host: "local", path: projectDir }],
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const result = await runSpaceDoctor({
      projectPath: projectDir,
      spaceId: "spc_demo",
      skipTests: true,
    });
    expect(result.local?.counts.flows).toBe(1);
    expect(result.issues.some((issue) => issue.code === "LOCAL_VALIDATION_FAILED")).toBe(false);
  });

  test("reports INDEX_DRIFT when hub digests differ", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          counts: { actions: 1, executors: 0, hooks: 0, flows: 1 },
          digests: {
            actions: "sha256:stale",
            flows: [{ flow_id: "flw_flows_demo", digest: "sha256:stale" }],
          },
          bindings: [{ host: "local", path: projectDir }],
        }),
      })),
    );

    const result = await runSpaceDoctor({
      projectPath: projectDir,
      spaceId: "spc_demo",
      auth: { hubUrl: "http://127.0.0.1:8787", token: "tok_test" },
      skipTests: true,
    });

    expect(result.ok).toBe(true);
    expect(result.issues.some((issue) => issue.code === "INDEX_DRIFT")).toBe(true);
  });

  test("uses resolved auth for hub index checks (no options.auth required)", async () => {
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_env";
    mkdirSync(join(projectDir, ".cursor"), { recursive: true });
    writeFileSync(
      join(projectDir, ".cursor", "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            murrmure: {
              command: "murrmure-mcp",
              env: {
                MURRMURE_HUB_TOKEN: "${env:MURRMURE_HUB_TOKEN}",
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const fetchSpy = vi.fn(async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/v1/spaces/spc_demo/index/status")) {
        return new Response(
          JSON.stringify({
            counts: { actions: 1, executors: 0, hooks: 0, flows: 1 },
            digests: {
              actions: "sha256:actions",
              flows: [{ flow_id: "flw_flows_demo", digest: "sha256:flow" }],
            },
            bindings: [{ host: "local", path: projectDir }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/auth/whoami")) {
        return new Response(
          JSON.stringify({
            actor_id: "act_demo",
            kind: "grant",
            token_id: "tok_env",
            spaces: [{ space_id: "spc_demo", scopes: ["space:read", "step:resolve"] }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/mcp/catalog")) {
        return new Response(
          JSON.stringify({
            tools: [
              { name: "murrmure_space_status", inputSchema: { type: "object" } },
              {
                name: "murrmure_resolve_step",
                inputSchema: {
                  type: "object",
                  required: ["run_id", "step_id", "branch"],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/mcp/tools/call")) {
        return new Response(JSON.stringify({ result: { ok: true } }), { status: 200 });
      }
      if (url.includes("/v1/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await runSpaceDoctor({
      projectPath: projectDir,
      spaceId: "spc_demo",
      skipTests: true,
    });

    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/v1/spaces/spc_demo/index/status"))).toBe(true);
    expect(result.issues.some((issue) => issue.code === "HUB_CHECK_SKIPPED")).toBe(false);
  });

  test("warns about legacy triggers.yaml alias", async () => {
    writeFileSync(
      join(projectDir, ".mrmr", "triggers.yaml"),
      "version: 1\nhooks:\n  on_event:\n    on:\n      event:\n        type: mrmr.spec.published\n    do:\n      - invoke:\n          action: hello\n",
    );

    const result = await runSpaceDoctor({
      projectPath: projectDir,
      spaceId: "spc_demo",
      skipTests: true,
    });

    expect(result.issues.some((issue) => issue.code === "DEPRECATED_CONFIG")).toBe(true);
  });

  test("detects legacy studio layout without murrmure/", async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "cli-space-legacy-"));
    writeFileSync(
      join(legacyDir, "package.json"),
      JSON.stringify({
        devDependencies: { "@studio/capability-sdk": "file:../sdk" },
      }),
    );
    mkdirSync(join(legacyDir, "workflows", "demo"), { recursive: true });
    writeFileSync(join(legacyDir, "workflows", "demo", "capability.manifest.json"), "{}");

    const result = await runSpaceDoctor({ cwd: join(legacyDir, "workflows"), skipTests: true });
    expect(result.workspace.legacy_studio_detected).toBe(true);
    expect(result.issues.some((issue) => issue.code === "MURRMURE_DIR_MISSING")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "LEGACY_STUDIO_PACKAGE")).toBe(true);
    expect(result.suggestions.some((step) => step.includes("mrmr space init"))).toBe(true);

    rmSync(legacyDir, { recursive: true, force: true });
  });

  test("discovers murrmure project from subdirectory cwd", () => {
    const sub = join(projectDir, "packages", "app");
    mkdirSync(sub, { recursive: true });
    const discovered = discoverMurrmureProject(sub);
    expect(discovered.projectPath).toBe(projectDir);
    expect(discovered.murrmurePresent).toBe(true);
  });

  test("scanLegacyWorkspace flags capability manifests", () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "cli-legacy-scan-"));
    mkdirSync(join(legacyDir, "flows", "x"), { recursive: true });
    writeFileSync(join(legacyDir, "flows", "x", "capability.manifest.json"), "{}");
    const issues = scanLegacyWorkspace(legacyDir);
    expect(issues.some((issue) => issue.code === "LEGACY_CAPABILITY_MANIFEST")).toBe(true);
    rmSync(legacyDir, { recursive: true, force: true });
  });

  test("formats legacy migration output without internal codes", async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "cli-space-legacy-fmt-"));
    mkdirSync(join(legacyDir, ".mrmr", "space"), { recursive: true });
    writeFileSync(
      join(legacyDir, ".mrmr", "space", "space.yaml"),
      "apiVersion: murrmure.space/v1\nslug: legacy\nname: Legacy\n",
    );
    writeFileSync(
      join(legacyDir, "package.json"),
      JSON.stringify({ devDependencies: { "@studio/capability-sdk": "1.0.0" } }),
    );
    mkdirSync(join(legacyDir, "workflows", "demo"), { recursive: true });
    writeFileSync(join(legacyDir, "workflows", "demo", "capability.manifest.json"), "{}");

    const result = await runSpaceDoctor({ cwd: legacyDir, skipTests: true });
    const text = formatSpaceDoctorHuman(result);
    expect(text).not.toContain("LEGACY_STUDIO_PACKAGE");
    expect(text).toContain("Legacy Studio v1 detected");
    expect(text).toContain("Try this");
    expect(text).toContain("mrmr space onboard");

    rmSync(legacyDir, { recursive: true, force: true });
  });

  test("maps MCP issue codes to actionable fix steps", () => {
    const expectedCommandByCode: Array<[string, string]> = [
      ["MCP_DISCOVERY", "mrmr login --hub-url"],
      ["MCP_CONFIG_SHAPE", "mrmr space doctor --fix"],
      ["MCP_TOKEN_SET", "mrmr grant mint --space spc_demo --label cursor-agent"],
      ["MCP_TOKEN_SPACE_MATCH", "mrmr grant use --space spc_demo"],
      ["MCP_CATALOG_LIVE", "mrmr whoami"],
      ["MCP_SCHEMA_PRESENT", "update/restart hub daemon"],
      ["MCP_PROBE_INVOKE", "mrmr whoami"],
    ];

    for (const [issueCode, expectedCommand] of expectedCommandByCode) {
      const plan = buildSpaceDoctorFixPlan({
        ok: false,
        space_id: "spc_demo",
        project_path: projectDir,
        workspace: {
          cwd: projectDir,
          project_path: projectDir,
          murrmure_present: true,
          link_present: true,
          linked_space_id: "spc_demo",
          auth_source: "env",
          auth_configured: true,
          hub_url: "http://127.0.0.1:8787",
          default_space_id: "spc_demo",
          legacy_studio_detected: false,
        },
        issues: [{ code: issueCode, severity: "warning", message: issueCode }],
        suggestions: [],
        mcp: {
          config_paths: [join(projectDir, ".cursor", "mcp.json")],
          servers: [],
          suggested_config_path: join(projectDir, ".cursor", "mcp.json"),
          suggested_snippet: "{}",
        },
      });

      expect(
        plan.some((step) => step.command.includes(expectedCommand)),
        `${issueCode} should map to "${expectedCommand}"`,
      ).toBe(true);
    }
  });
});
