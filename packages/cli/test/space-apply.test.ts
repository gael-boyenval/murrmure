import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spaceApplyCommand } from "../src/commands/space/apply.js";
import { readSpaceApplyBundle } from "../src/lib/space-directory.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";
import {
  lintSpaceApplyBundle,
  strictLintFailures,
  type SpaceApplyBundle,
} from "@murrmure/hub-core";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../studio-specs/current/fixtures/space-apply",
);

function loadFixture(name: string): { bundle: SpaceApplyBundle; expect: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8")) as {
    bundle: SpaceApplyBundle;
    expect: Record<string, unknown>;
  };
}

describe("space apply integration", () => {
  const envSnapshot = { ...process.env };
  let projectDir: string;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_admin";
    clearAuthContextCache();
    projectDir = mkdtempSync(join(tmpdir(), "cli-space-apply-"));
    const root = join(projectDir, "murrmure");
    mkdirSync(join(root, "flows", "demo"), { recursive: true });
    writeFileSync(
      join(root, "actions.yaml"),
      "version: 1\nactions:\n  hello:\n    executor: shell\n",
    );
    writeFileSync(
      join(root, "flows", "demo", "flow.manifest.yaml"),
      "apiVersion: murrmure.flow/v1\nname: demo\nstart:\n  manual: true\nsteps:\n  - id: hello\n    invoke:\n      space: spc_demo\n      action: hello\n",
    );
    mkdirSync(join(projectDir, ".murrmure"), { recursive: true });
    writeFileSync(
      join(projectDir, ".murrmure", "link.json"),
      JSON.stringify({ space_id: "spc_demo", path: projectDir, host: "local" }),
    );
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("readSpaceApplyBundle parses fixture tree", () => {
    const bundle = readSpaceApplyBundle(projectDir);
    expect(bundle.actions?.file.actions.hello).toBeDefined();
    expect(bundle.flows?.length).toBe(1);
    expect(bundle.flows?.[0]?.flow_id).toBe("flw_flows_demo");
  });

  test("readSpaceApplyBundle clears absent yaml sections with empty files", () => {
    unlinkSync(join(projectDir, "murrmure", "actions.yaml"));
    const bundle = readSpaceApplyBundle(projectDir);
    expect(bundle.actions?.file.actions).toEqual({});
    expect(bundle.executors?.file.executors).toEqual({});
    expect(bundle.hooks?.file.hooks).toEqual({});
  });

  test("readSpaceApplyBundle loads hooks from triggers.yaml alias", () => {
    writeFileSync(
      join(projectDir, "murrmure", "triggers.yaml"),
      "version: 1\nhooks:\n  on_event:\n    on:\n      event:\n        type: mrmr.spec.published\n    do:\n      - invoke:\n          action: hello\n",
    );
    const bundle = readSpaceApplyBundle(projectDir);
    expect(bundle.hooks?.file.hooks.on_event).toBeDefined();
  });

  test("readSpaceApplyBundle prefers hooks.yaml over triggers.yaml", () => {
    writeFileSync(
      join(projectDir, "murrmure", "hooks.yaml"),
      "version: 1\nhooks:\n  canonical:\n    on:\n      event:\n        type: mrmr.canonical\n    do:\n      - invoke:\n          action: hello\n",
    );
    writeFileSync(
      join(projectDir, "murrmure", "triggers.yaml"),
      "version: 1\nhooks:\n  alias_only:\n    on:\n      event:\n        type: mrmr.alias\n    do:\n      - invoke:\n          action: hello\n",
    );
    const bundle = readSpaceApplyBundle(projectDir);
    expect(bundle.hooks?.file.hooks.canonical).toBeDefined();
    expect(bundle.hooks?.file.hooks.alias_only).toBeUndefined();
  });

  test("readSpaceApplyBundle derives unique flow ids from manifest path", () => {
    const root = join(projectDir, "murrmure", "flows");
    mkdirSync(join(root, "other"), { recursive: true });
    writeFileSync(
      join(root, "other", "flow.manifest.yaml"),
      "apiVersion: murrmure.flow/v1\nname: demo\nstart:\n  manual: true\nsteps: []\n",
    );
    const bundle = readSpaceApplyBundle(projectDir);
    const ids = (bundle.flows ?? []).map((f) => f.flow_id);
    expect(ids).toContain("flw_flows_demo");
    expect(ids).toContain("flw_flows_other");
    expect(new Set(ids).size).toBe(2);
  });

  test("apply posts bundle to hub", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_admin",
            token_id: "tok_admin",
            spaces: [{ space_id: "spc_demo", scopes: ["space:admin"] }],
          }),
        };
      }
      if (url.endsWith("/v1/spaces/spc_demo/apply") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { bundle: { actions?: unknown } };
        expect(body.bundle.actions).toBeDefined();
        return {
          ok: true,
          status: 200,
          json: async () => ({ summary: { actions: 1, flows: 1, changed: 2 }, warnings: [] }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await (spaceApplyCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: projectDir },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_demo/apply",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("gate-only fixture warns pre phase 03", () => {
    const { bundle, expect: fx } = loadFixture("unsupported-step-kind.json");
    const warnings = lintSpaceApplyBundle(bundle);
    for (const row of fx.warnings_contain as Array<{ code: string; step_id?: string }>) {
      expect(
        warnings.some((w) => w.code === row.code && (!row.step_id || w.step_id === row.step_id)),
      ).toBe(true);
    }
    expect(strictLintFailures(warnings).length).toBeGreaterThan(0);
  });

  test("checkpoint-on-resolve-missing fixture warns; strict fails", () => {
    const { bundle, expect: fx } = loadFixture("checkpoint-on-resolve-missing.json");
    const warnings = lintSpaceApplyBundle(bundle);
    for (const row of fx.warnings_contain as Array<{ code: string; step_id?: string }>) {
      expect(
        warnings.some((w) => w.code === row.code && (!row.step_id || w.step_id === row.step_id)),
      ).toBe(true);
    }
    expect(strictLintFailures(warnings).length).toBeGreaterThan(0);
  });

  test("checkpoint view dist missing fails under strict", async () => {
    const root = join(projectDir, "murrmure");
    mkdirSync(join(root, "flows", "review"), { recursive: true });
    mkdirSync(join(root, "views", "my-view"), { recursive: true });
    writeFileSync(
      join(root, "executors.yaml"),
      "executors:\n  shell:\n    binding:\n      type: shell_spawn\n      executor_id: shell\n",
    );
    writeFileSync(
      join(root, "views", "my-view", "view.manifest.yaml"),
      "apiVersion: murrmure.view/v1\nid: my-view\nentry: dist/index.html\n",
    );
    writeFileSync(
      join(root, "flows", "review", "flow.manifest.yaml"),
      [
        "apiVersion: murrmure.flow/v1",
        "name: review",
        "start:",
        "  manual: true",
        "steps:",
        "  - id: intake",
        "    checkpoint:",
        "      view: my-view",
        "      on_resolve:",
        "        default:",
        "          goto: done",
        "        cancel:",
        "          fail: true",
        "  - id: done",
        "    invoke:",
        "      space: spc_demo",
        "      action: hello",
      ].join("\n"),
    );

    const bundle = readSpaceApplyBundle(projectDir);
    const warnings = lintSpaceApplyBundle(bundle);
    expect(warnings.some((w) => w.code === "CHECKPOINT_VIEW_DIST_MISSING")).toBe(true);
    expect(strictLintFailures(warnings).some((w) => w.code === "CHECKPOINT_VIEW_DIST_MISSING")).toBe(
      true,
    );

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as typeof process.exit);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_admin",
            token_id: "tok_admin",
            spaces: [{ space_id: "spc_demo", scopes: ["space:admin"] }],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      (spaceApplyCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { path: projectDir, strict: true },
        rawArgs: [],
      }),
    ).rejects.toThrow("exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fetchMock).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
