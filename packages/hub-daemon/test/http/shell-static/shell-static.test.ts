import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";

describe("http/shell-static/shell-static", () => {
  let baseUrl: string;
  let cleanup: () => void;

  const marker = "shell-static-test-index";

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-shell-static-test-"));
    const shellDistDir = join(dir, "dist");
    mkdirSync(shellDistDir, { recursive: true });
    writeFileSync(
      join(shellDistDir, "index.html"),
      `<!doctype html><html><body><div id="root">${marker}</div></body></html>`,
    );
    writeFileSync(join(shellDistDir, "app.css"), "body { color: rgb(17, 34, 51); }\n");

    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
      shellStaticDir: shellDistDir,
    });

    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;

    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };
  });

  afterAll(() => cleanup?.());

  test("GET / returns shell index.html", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain(marker);
  });

  test("GET /v1/health remains available", async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  test("GET /configure/spaces/x falls back to index.html", async () => {
    const res = await fetch(`${baseUrl}/configure/spaces/x`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain(marker);
  });

  test("GET /app.css serves static asset", async () => {
    const res = await fetch(`${baseUrl}/app.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toContain("color");
  });

  test("GET /flows/* is not swallowed by SPA fallback", async () => {
    const res = await fetch(`${baseUrl}/flows/not-installed/0.0.1/ui/shell.html`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(marker);
  });

  test("GET /api/* remains 404 when no flow route is mounted", async () => {
    const res = await fetch(`${baseUrl}/api/foo`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(marker);
  });

  test("GET traversal paths are rejected instead of falling back to index.html", async () => {
    const res = await fetch(`${baseUrl}/..%2F..%2Fetc%2Fpasswd`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(marker);
  });
});

describe("http/shell-static/startup-validation", () => {
  test("throws when shell static dir is missing index.html", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-shell-static-invalid-"));
    const shellDistDir = join(dir, "dist");
    mkdirSync(shellDistDir, { recursive: true });
    try {
      await expect(
        startHubDaemon({
          databasePath: join(dir, "murrmure.db"),
          port: 0,
          dataDir: join(dir, "data"),
          defaultSpaceId: "",
          bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
          shellStaticDir: shellDistDir,
        }),
      ).rejects.toThrow(/MURRMURE_SHELL_STATIC_DIR.*index\.html/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
