import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildHubSpawnEnv,
  isDesktopDevHmrMode,
  resolveDatabasePath,
  resolveDesktopPaths,
  shouldPreferLegacyDatabaseMigration,
  SHELL_DEV_PORT,
} from "../src/paths.js";

describe("resolveDesktopPaths dev-hmr", () => {
  test("uses VITE shell URL and hub watch spawn args", () => {
    const paths = resolveDesktopPaths({
      mode: "dev-hmr",
      cwd: "/repo/apps/desktop",
      env: {
        MURRMURE_REPO_ROOT: "/repo",
        MURRMURE_DATA_DIR: "/tmp/murrmure",
      },
    });

    expect(paths.shellWebUrl).toBe(`http://127.0.0.1:${SHELL_DEV_PORT}`);
    expect(paths.hubUrl).toBe("http://127.0.0.1:8787");
    expect(paths.hubCommand).toBe("pnpm");
    expect(paths.hubArgs).toEqual(["--filter", "@murrmure/hub-daemon", "dev:watch"]);
    expect(paths.shellStaticDir).toBe("");
  });

  test("respects VITE_PORT and PORT overrides in dev-hmr", () => {
    const paths = resolveDesktopPaths({
      mode: "dev-hmr",
      cwd: "/repo/apps/desktop",
      env: {
        MURRMURE_REPO_ROOT: "/repo",
        VITE_PORT: "5199",
        PORT: "9001",
      },
    });

    expect(paths.shellWebUrl).toBe("http://127.0.0.1:5199");
    expect(paths.hubUrl).toBe("http://127.0.0.1:9001");
    expect(paths.healthUrl).toBe("http://127.0.0.1:9001/v1/health");
  });

  test("buildHubSpawnEnv omits MURRMURE_SHELL_STATIC_DIR in dev-hmr", () => {
    const paths = resolveDesktopPaths({
      mode: "dev-hmr",
      cwd: "/repo/apps/desktop",
      env: {
        MURRMURE_REPO_ROOT: "/repo",
        MURRMURE_DATA_DIR: "/tmp/murrmure",
      },
    });

    const env = buildHubSpawnEnv(paths, {
      PATH: "/usr/bin",
      MURRMURE_SHELL_STATIC_DIR: "/should-not-leak",
    });

    expect(env.MURRMURE_SHELL_STATIC_DIR).toBeUndefined();
    expect(env.MURRMURE_BUNDLE_ROOT).toBe("/repo/fixtures");
    expect(env.MURRMURE_DATA_DIR).toBe("/tmp/murrmure");
    expect(env.DATABASE_PATH).toBe("/tmp/murrmure/murrmure.db");
    expect(env.PORT).toBe("8787");
  });

  test("buildHubSpawnEnv keeps MURRMURE_SHELL_STATIC_DIR for dev smoke mode", () => {
    const paths = resolveDesktopPaths({
      mode: "dev",
      cwd: "/repo/apps/desktop",
      env: {
        MURRMURE_REPO_ROOT: "/repo",
        MURRMURE_DATA_DIR: "/tmp/murrmure",
      },
    });

    const env = buildHubSpawnEnv(paths, { PATH: "/usr/bin" });
    expect(env.MURRMURE_SHELL_STATIC_DIR).toBe("/repo/packages/shell-web/dist");
  });
});

describe("isDesktopDevHmrMode", () => {
  test("detects MURRMURE_DESKTOP_DEV_HMR=1", () => {
    expect(isDesktopDevHmrMode({ MURRMURE_DESKTOP_DEV_HMR: "1" })).toBe(true);
    expect(isDesktopDevHmrMode({ MURRMURE_DESKTOP_DEV_HMR: "0" })).toBe(false);
    expect(isDesktopDevHmrMode({})).toBe(false);
  });
});

describe("resolveDatabasePath", () => {
  test("returns murrmure.db when already present", () => {
    const dir = mkdtempSync(join(tmpdir(), "murrmure-db-"));
    writeFileSync(join(dir, "murrmure.db"), "");
    expect(resolveDatabasePath(dir)).toBe(join(dir, "murrmure.db"));
    rmSync(dir, { recursive: true, force: true });
  });

  test("migrates legacy studio.db to murrmure.db", () => {
    const dir = mkdtempSync(join(tmpdir(), "murrmure-db-"));
    writeFileSync(join(dir, "studio.db"), "legacy");
    const logs: string[] = [];
    const path = resolveDatabasePath(dir, (msg) => logs.push(msg));
    expect(path).toBe(join(dir, "murrmure.db"));
    expect(existsSync(join(dir, "murrmure.db"))).toBe(true);
    expect(existsSync(join(dir, "studio.db"))).toBe(false);
    expect(logs.some((l) => l.includes("Migrated legacy database"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildHubSpawnEnv uses migrated database path", () => {
    const dir = mkdtempSync(join(tmpdir(), "murrmure-db-"));
    writeFileSync(join(dir, "studio.db"), "legacy");
    const paths = resolveDesktopPaths({
      mode: "dev",
      cwd: "/repo/apps/desktop",
      env: { MURRMURE_REPO_ROOT: "/repo", MURRMURE_DATA_DIR: dir },
    });
    const env = buildHubSpawnEnv(paths, { PATH: "/usr/bin" });
    expect(env.DATABASE_PATH).toBe(join(dir, "murrmure.db"));
    rmSync(dir, { recursive: true, force: true });
  });

  test("prefers legacy studio.db when murrmure.db is empty placeholder", () => {
    const dir = mkdtempSync(join(tmpdir(), "murrmure-db-"));
    writeFileSync(join(dir, "murrmure.db"), "");
    writeFileSync(join(dir, "studio.db"), "x".repeat(9000));
    const logs: string[] = [];
    const path = resolveDatabasePath(dir, (msg) => logs.push(msg));
    expect(path).toBe(join(dir, "murrmure.db"));
    expect(existsSync(join(dir, "studio.db"))).toBe(false);
    expect(existsSync(join(dir, "murrmure.db"))).toBe(true);
    expect(logs.some((l) => l.includes("Replacing empty"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("shouldPreferLegacyDatabaseMigration detects empty canonical with data legacy", () => {
    const dir = mkdtempSync(join(tmpdir(), "murrmure-db-"));
    const canonical = join(dir, "murrmure.db");
    const legacy = join(dir, "studio.db");
    writeFileSync(canonical, "");
    writeFileSync(legacy, "x".repeat(9000));
    expect(shouldPreferLegacyDatabaseMigration(canonical, legacy)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
