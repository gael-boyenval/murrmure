import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const MCP_CONFIG_PATH = join(REPO_ROOT, ".cursor", "mcp.json");

const PLANE_PAT_ENDPOINT = "https://mcp.plane.so/http/api-key/mcp";
const PLANE_AUTH_INTERPOLATION = "Bearer ${env:PLANE_PAT}";
const PLANE_WORKSPACE_SLUG = "gbworks";

/** Literal Bearer token that is not Cursor's `${env:PLANE_PAT}` interpolation. */
const LITERAL_BEARER = /Bearer\s+(?!\$\{env:PLANE_PAT\})(\S+)/g;

/**
 * `PLANE_PAT=` followed by a secret-shaped value. Placeholders (`<token>`,
 * `${…}`, empty, short words) are allowed so docs can name the variable.
 */
const PLANE_PAT_ASSIGNMENT =
  /PLANE_PAT\s*=\s*(["']?)(?!\$\{)(?!<)(?!\.\.\.)([A-Za-z0-9_\-+./]{16,})\1/;

function listCommittedFiles(): string[] {
  const stdout = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return stdout.split("\0").filter(Boolean);
}

function isProbablyText(relPath: string): boolean {
  return !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|zip|gz|tgz|wasm|mp4|mov|pdf|bin)$/i.test(
    relPath,
  );
}

describe("Plane PAT MCP config (GBD-30)", () => {
  test("repo .cursor/mcp.json uses the PAT endpoint and interpolation token", () => {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      mcpServers?: {
        plane?: {
          url?: string;
          headers?: { Authorization?: string; "x-workspace-slug"?: string };
        };
      };
    };
    const plane = parsed.mcpServers?.plane;
    expect(plane?.url).toBe(PLANE_PAT_ENDPOINT);
    expect(plane?.headers?.Authorization).toBe(PLANE_AUTH_INTERPOLATION);
    expect(plane?.headers?.["x-workspace-slug"]).toBe(PLANE_WORKSPACE_SLUG);

    const literalBearers = [...raw.matchAll(LITERAL_BEARER)].map((m) => m[1]);
    expect(literalBearers, "mcp.json must not embed a resolved Bearer token").toEqual(
      [],
    );
  });

  test("committed tree has no PLANE_PAT= assignment with a real-looking value", () => {
    const leaks: string[] = [];
    for (const relPath of listCommittedFiles()) {
      if (!isProbablyText(relPath)) continue;
      const absPath = join(REPO_ROOT, relPath);
      let source: string;
      try {
        source = readFileSync(absPath, "utf8");
      } catch {
        continue;
      }
      if (PLANE_PAT_ASSIGNMENT.test(source)) {
        leaks.push(relPath);
      }
    }
    expect(leaks, "PLANE_PAT must stay out of repository files").toEqual([]);
  });
});
