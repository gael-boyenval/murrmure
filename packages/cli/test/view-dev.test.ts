import { afterEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import {
  detectPackageManager,
  listViewFixtures,
  parseViteDevUrl,
  startViewDevProcess,
  validateViewDevPackage,
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
    expect(listViewFixtures(viewDir).length).toBeGreaterThanOrEqual(2);
  });

  test("resolveViewDevPaths rejects path traversal view id", () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-escape-"));
    targetDir = dir;
    mkdirSync(join(dir, "murrmure", "views", "safe"), { recursive: true });
    expect(() => resolveViewDevPaths(join(dir, "murrmure"), "../outside")).toThrow(/Invalid view id/);
  });

  test("startViewDevProcess invokes npm run dev", async () => {
    const dir = mkdtempSync(join(tmpdir(), "view-dev-spawn-"));
    targetDir = dir;
    mkdirSync(join(dir, "murrmure"), { recursive: true });
    scaffoldViewPackage(join(dir, "murrmure"), "demo");
    const viewDir = join(dir, "murrmure", "views", "demo");

    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      kill: vi.fn(),
    });

    spawnMock.mockReturnValue(child);

    const handle = startViewDevProcess(viewDir);
    expect(spawnMock).toHaveBeenCalledWith("npm", ["run", "dev"], expect.objectContaining({ cwd: viewDir }));

    setTimeout(() => {
      stdout.emit("data", Buffer.from("\n  ➜  Local:   http://127.0.0.1:5173/\n"));
    }, 10);

    await expect(handle.devUrl).resolves.toBe("http://127.0.0.1:5173/");
    handle.stop();
  });
});
