import { afterEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import {
  detectPackageManager,
  listViewFixtures,
  parseViteDevUrl,
  assertViewDevServerUrl,
  clearViewDevSession,
  startViewDevProcess,
  validateViewDevPackage,
  writeViewDevSession,
} from "../src/lib/view-dev.js";
import { resolveViewDevPaths } from "../src/lib/view-dev.js";
import { scaffoldViewPackage } from "../src/lib/view-scaffold.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: spawnMock };
});

describe("view dev", () => {
  let targetDir: string;

  afterEach(() => {
    if (targetDir && existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    spawnMock.mockReset();
    vi.restoreAllMocks();
  });

  test("parseViteDevUrl extracts localhost URL", () => {
    expect(parseViteDevUrl("  ➜  Local:   http://localhost:5173/")).toBe("http://localhost:5173/");
  });

  test("detectPackageManager prefers lockfiles", () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-pm-"));
    targetDir = dir;
    expect(detectPackageManager(dir)).toBe("npm");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "", "utf-8");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });

  test("validateViewDevPackage requires scripts.dev and fixtures", () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-val-"));
    targetDir = dir;
    mkdirSync(join(dir, "murrmure"), { recursive: true });
    scaffoldViewPackage(join(dir, "murrmure"), "demo");
    const viewDir = join(dir, "murrmure", "views", "demo");
    expect(() => validateViewDevPackage(viewDir)).not.toThrow();
    expect(listViewFixtures(viewDir)).toHaveLength(1);
    expect(listViewFixtures(viewDir)[0]?.name).toBe("intake");
  });

  test("resolveViewDevPaths rejects path traversal view id", () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-escape-"));
    targetDir = dir;
    mkdirSync(join(dir, "murrmure", "views", "safe"), { recursive: true });
    expect(() => resolveViewDevPaths(join(dir, "murrmure"), "../outside")).toThrow(/Invalid view id/);
  });

  test("startViewDevProcess invokes npm run dev with a dedicated port", async () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-spawn-"));
    targetDir = dir;
    mkdirSync(join(dir, "murrmure"), { recursive: true });
    scaffoldViewPackage(join(dir, "murrmure"), "demo");
    const viewDir = join(dir, "murrmure", "views", "demo");
    mkdirSync(join(viewDir, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(viewDir, "node_modules", ".bin", "vite"), "#!/bin/sh\n", {
      mode: 0o755,
    });

    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      kill: vi.fn(),
    });

    spawnMock.mockReturnValue(child);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response('<!doctype html><div id="root"></div><script src="/src/main.tsx"></script>', {
          status: 200,
        }),
      ),
    );

    const handle = startViewDevProcess(viewDir);
    expect(spawnMock).toHaveBeenCalledWith(
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5199", "--strictPort"],
      expect.objectContaining({ cwd: viewDir }),
    );

    setTimeout(() => {
      stdout.emit("data", Buffer.from("\n  ➜  Local:   http://127.0.0.1:5199/\n"));
    }, 10);

    await expect(handle.devUrl).resolves.toBe("http://127.0.0.1:5199/");
    handle.stop();
  });

  test("assertViewDevServerUrl rejects Desktop shell HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>Create your first space. No spaces linked yet. Murrmure Observer</html>", {
          status: 200,
        }),
      ),
    );
    const result = await assertViewDevServerUrl("http://127.0.0.1:5174/", "demo");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Desktop\/shell/);
  });

  test("startViewDevProcess fails when vite is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-novite-"));
    targetDir = dir;
    mkdirSync(join(dir, "murrmure"), { recursive: true });
    scaffoldViewPackage(join(dir, "murrmure"), "demo");
    const viewDir = join(dir, "murrmure", "views", "demo");
    expect(() => startViewDevProcess(viewDir)).toThrow(/Vite not found/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("clearViewDevSession removes view-dev.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-clear-"));
    targetDir = dir;
    writeViewDevSession(dir, {
      view_id: "demo",
      view_dir: join(dir, ".mrmr", "views", "demo"),
      fixtures: [],
      started_at: new Date().toISOString(),
    });
    expect(existsSync(join(dir, ".mrmr", "dev", "view-dev.json"))).toBe(true);
    clearViewDevSession(dir);
    expect(existsSync(join(dir, ".mrmr", "dev", "view-dev.json"))).toBe(false);
  });
});
