import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { detectExistingHub, stopHubChild, waitForHubHealth, waitForShellDevReady } from "../src/lifecycle.js";
import { resolveDesktopPaths } from "../src/paths.js";

describe("desktop lifecycle", () => {
  test("waitForHubHealth retries until endpoint is ready", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => {
      if (fetchImpl.mock.calls.length < 3) {
        return new Response("not ready", { status: 503 });
      }
      return new Response("ok", { status: 200 });
    });

    const attempts = await waitForHubHealth("http://127.0.0.1:8787/v1/health", {
      timeoutMs: 1_000,
      intervalMs: 100,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
      sleepImpl: async (ms) => {
        now += ms;
      },
    });

    expect(attempts).toBe(3);
  });

  test("waitForHubHealth fails when timeout is exceeded", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => new Response("not ready", { status: 503 }));

    await expect(
      waitForHubHealth("http://127.0.0.1:8787/v1/health", {
        timeoutMs: 250,
        intervalMs: 100,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: () => now,
        sleepImpl: async (ms) => {
          now += ms;
        },
      }),
    ).rejects.toThrow(/did not become ready/i);
  });

  test("waitForShellDevReady accepts Vite shell index.html markers", async () => {
    const shellHtml = `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;
    const fetchImpl = vi.fn(async () => new Response(shellHtml, { status: 200 }));

    const attempts = await waitForShellDevReady("http://127.0.0.1:5174", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => undefined,
    });

    expect(attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:5174/", expect.any(Object));
  });

  test("waitForShellDevReady rejects generic HTTP 200 responses", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => new Response("<html><body>ok</body></html>", { status: 200 }));

    await expect(
      waitForShellDevReady("http://127.0.0.1:5174", {
        timeoutMs: 250,
        intervalMs: 100,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: () => now,
        sleepImpl: async (ms) => {
          now += ms;
        },
      }),
    ).rejects.toThrow(/Shell dev server did not become ready/i);
  });

  test("detectExistingHub returns running when lock owner is healthy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "desktop-lock-owner-"));
    const ownerPath = join(dir, "hub.lock", "owner.json");
    mkdirSync(join(dir, "hub.lock"), { recursive: true });
    writeFileSync(ownerPath, JSON.stringify({ endpoint: "http://127.0.0.1:8787" }));

    try {
      const status = await detectExistingHub(
        ownerPath,
        (async () => new Response("ok", { status: 200 })) as typeof fetch,
      );
      expect(status).toEqual({
        running: true,
        endpoint: "http://127.0.0.1:8787",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stopHubChild escalates from SIGTERM to SIGKILL", async () => {
    const signals: string[] = [];
    let resolveExit: () => void = () => undefined;
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const child = {
      exited,
      kill: (signal?: string | number) => {
        signals.push(String(signal));
        if (signal === "SIGKILL") {
          resolveExit();
        }
      },
    };

    const result = await stopHubChild(child, {
      timeoutMs: 1,
      sleepImpl: async () => undefined,
    });
    expect(result).toBe("killed");
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  test("resolveDesktopPaths returns monorepo dev paths", () => {
    const paths = resolveDesktopPaths({
      mode: "dev",
      cwd: "/tmp/work/apps/desktop",
      env: {
        MURRMURE_REPO_ROOT: "/tmp/work",
      },
    });

    expect(paths.hubEntry).toBe("/tmp/work/packages/hub-daemon/dist/main.js");
    expect(paths.hubCommand).toBe("pnpm");
    expect(paths.hubArgs).toEqual(["--filter", "@murrmure/hub-daemon", "start"]);
    expect(paths.shellStaticDir).toBe("/tmp/work/packages/shell-web/dist");
    expect(paths.bundleRoot).toBe("/tmp/work/fixtures");
    expect(paths.port).toBe(8787);
  });

  test("resolveDesktopPaths honors packaged overrides", () => {
    const paths = resolveDesktopPaths({
      mode: "prod",
      cwd: "/Applications/Murrmure.app/Contents/MacOS",
      env: {
        PORT: "8787",
        MURRMURE_DESKTOP_NODE: "/bundle/node",
        MURRMURE_DESKTOP_HUB_ENTRY: "/bundle/resources/hub/main.js",
        MURRMURE_SHELL_STATIC_DIR: "/bundle/resources/shell/dist",
        MURRMURE_BUNDLE_ROOT: "/bundle/resources",
      },
    });

    expect(paths.nodeBinary).toBe("/bundle/node");
    expect(paths.hubEntry).toBe("/bundle/resources/hub/main.js");
    expect(paths.hubCommand).toBe("/bundle/node");
    expect(paths.hubArgs).toEqual(["/bundle/resources/hub/main.js"]);
    expect(paths.shellStaticDir).toBe("/bundle/resources/shell/dist");
    expect(paths.bundleRoot).toBe("/bundle/resources");
    expect(paths.hubUrl).toBe("http://127.0.0.1:8787");
  });
});
