import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  buildConnectionDescriptor,
  findConnectionAdapter,
  writeSetupResume,
} from "../src/lib/connection-adapters.js";
import {
  readActiveConnection,
  readStoredConnection,
  writeActiveConnection,
  writeStoredConnection,
} from "../src/lib/connection-store.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "murrmure-connection-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("local connection onboarding", () => {
  test("locks the exact local-tools/v1 profile", () => {
    const descriptor = buildConnectionDescriptor({
      hubId: "http://127.0.0.1:8787",
      connectionId: "con_local",
      spaceId: "spc_local",
      command: "/Users/test/.murrmure/bin/murrmure-mcp",
    });
    expect(descriptor.profile).toEqual({
      id: "local-tools/v1",
      capabilities: [
        "space:read",
        "flow:read",
        "flow:run",
        "step:resolve",
      ],
    });
    expect(JSON.stringify(descriptor)).not.toMatch(/token|action:invoke|gate:resolve|journal:read/);
  });

  test("cursor adapter prefers project mcp.json and strips the user duplicate", () => {
    const homePath = temporaryDirectory();
    const projectPath = temporaryDirectory();
    mkdirSync(join(homePath, ".cursor"), { recursive: true });
    mkdirSync(join(projectPath, ".cursor"), { recursive: true });
    writeFileSync(
      join(homePath, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          existing: { command: "existing-mcp" },
          murrmure: { command: "stale-murrmure-mcp" },
        },
        unrelated: true,
      }),
    );
    writeFileSync(
      join(projectPath, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: { other: { command: "other-mcp" } },
      }),
    );
    const descriptor = buildConnectionDescriptor({
      hubId: "http://127.0.0.1:8787",
      connectionId: "con_local",
      spaceId: "spc_local",
      command: join(homePath, ".murrmure", "bin", "murrmure-mcp"),
    });
    const adapter = findConnectionAdapter("cursor");
    expect(adapter).toBeDefined();
    const installed = adapter!.install(descriptor, { projectPath, homePath });

    expect(installed.paths).toContain(join(projectPath, ".cursor", "mcp.json"));

    const projectParsed = JSON.parse(
      readFileSync(join(projectPath, ".cursor", "mcp.json"), "utf8"),
    ) as {
      mcpServers: Record<string, { command: string; args?: string[]; env?: unknown }>;
    };
    expect(projectParsed.mcpServers.other.command).toBe("other-mcp");
    expect(projectParsed.mcpServers.murrmure.command).toBe(
      join(homePath, ".murrmure", "bin", "murrmure-mcp"),
    );
    expect(projectParsed.mcpServers.murrmure.args).toEqual([
      "--connection",
      "con_local",
    ]);
    expect(projectParsed.mcpServers.murrmure.env).toBeUndefined();

    const userParsed = JSON.parse(
      readFileSync(join(homePath, ".cursor", "mcp.json"), "utf8"),
    ) as {
      unrelated: boolean;
      mcpServers: Record<string, { command: string }>;
    };
    expect(userParsed.unrelated).toBe(true);
    expect(userParsed.mcpServers.existing.command).toBe("existing-mcp");
    expect(userParsed.mcpServers.murrmure).toBeUndefined();
  });

  test("activation and reload resume files contain IDs only", () => {
    const homePath = temporaryDirectory();
    const active = {
      hub_id: "http://127.0.0.1:8787",
      connection_id: "con_local",
      space_id: "spc_local",
      profile: "local-tools/v1",
    };
    const activePath = writeActiveConnection(active, homePath);
    expect(readActiveConnection(homePath)).toEqual(active);

    const descriptor = buildConnectionDescriptor({
      hubId: active.hub_id,
      connectionId: active.connection_id,
      spaceId: active.space_id,
      command: join(homePath, ".murrmure", "bin", "murrmure-mcp"),
    });
    const resumePath = writeSetupResume({
      descriptor,
      adapters: ["generic"],
      next: "reload-and-verify",
      homePath,
    });
    for (const path of [activePath, resumePath]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/tok_|MURRMURE_HUB_TOKEN/);
    }
  });

  test("tracks active and revoked local descriptors without credentials", () => {
    const homePath = temporaryDirectory();
    const connection = {
      hub_id: "http://127.0.0.1:8787",
      connection_id: "con_local",
      space_id: "spc_local",
      profile: "local-tools/v1",
      status: "active" as const,
    };
    const path = writeStoredConnection(connection, homePath);
    expect(readStoredConnection("con_local", homePath)).toEqual(connection);

    writeStoredConnection({ ...connection, status: "revoked" }, homePath);
    expect(readStoredConnection("con_local", homePath)?.status).toBe("revoked");
    expect(readFileSync(path, "utf8")).not.toMatch(/tok_|MURRMURE_HUB_TOKEN/);
  });
});
