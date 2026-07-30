import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { installMurrmureSkill, readSkillVersion } from "../skill/install.js";
import {
  LOCAL_TOOLS_CAPABILITIES,
  LOCAL_TOOLS_PROFILE,
} from "../wizard/capabilities.js";
import { resolveMcpBridgeCommand } from "./space-doctor-mcp.js";

export interface ConnectionDescriptor {
  apiVersion: "murrmure.connection/v1";
  hub_id: string;
  connection_id: string;
  space_id: string;
  bridge: {
    command: string;
    args: string[];
  };
  profile: {
    id: typeof LOCAL_TOOLS_PROFILE.id;
    capabilities: readonly string[];
  };
  skills: {
    bundle: "murrmure-agent";
    version: string;
  };
  verify: readonly ["murrmure_space_status", "murrmure_resolve_step"];
}

export interface AdapterInstallResult {
  adapter_id: string;
  mode: "written" | "instructions";
  paths: string[];
  reload_required: boolean;
  instructions?: string;
}

export interface ConnectionAdapter {
  id: string;
  label: string;
  detect(options: { projectPath: string; homePath: string }): boolean;
  install(
    descriptor: ConnectionDescriptor,
    options: { projectPath: string; homePath: string },
  ): AdapterInstallResult;
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    throw new Error(`Cannot update invalid JSON at ${path}`);
  }
}

function upsertMurrmureMcpServer(
  configPath: string,
  server: Record<string, unknown>,
): void {
  const current = readJsonObject(configPath);
  const currentServers =
    current.mcpServers &&
    typeof current.mcpServers === "object" &&
    !Array.isArray(current.mcpServers)
      ? (current.mcpServers as Record<string, unknown>)
      : {};
  writeJsonAtomic(configPath, {
    ...current,
    mcpServers: {
      ...currentServers,
      murrmure: server,
    },
  });
}

/** Remove only the murrmure entry so Cursor does not load the same bridge twice. */
function stripMurrmureMcpServer(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  const current = readJsonObject(configPath);
  const currentServers =
    current.mcpServers &&
    typeof current.mcpServers === "object" &&
    !Array.isArray(current.mcpServers)
      ? { ...(current.mcpServers as Record<string, unknown>) }
      : {};
  if (!("murrmure" in currentServers)) return false;
  delete currentServers.murrmure;
  writeJsonAtomic(configPath, {
    ...current,
    mcpServers: currentServers,
  });
  return true;
}

export function buildConnectionDescriptor(options: {
  hubId: string;
  connectionId: string;
  spaceId: string;
  command?: string;
}): ConnectionDescriptor {
  return {
    apiVersion: "murrmure.connection/v1",
    hub_id: options.hubId,
    connection_id: options.connectionId,
    space_id: options.spaceId,
    bridge: {
      command: options.command ?? resolveMcpBridgeCommand(),
      // Pin the connection (hence space). Hub URL stays out of client config —
      // murrmure-mcp resolves it from Desktop discovery.
      args: ["--connection", options.connectionId],
    },
    profile: {
      id: LOCAL_TOOLS_PROFILE.id,
      capabilities: LOCAL_TOOLS_CAPABILITIES,
    },
    skills: {
      bundle: "murrmure-agent",
      version: readSkillVersion("agent"),
    },
    verify: ["murrmure_space_status", "murrmure_resolve_step"],
  };
}

export function descriptorMcpServer(
  descriptor: ConnectionDescriptor,
): Record<string, unknown> {
  return {
    command: descriptor.bridge.command,
    ...(descriptor.bridge.args.length > 0
      ? { args: descriptor.bridge.args }
      : {}),
  };
}

const cursorAdapter: ConnectionAdapter = {
  id: "cursor",
  label: "Cursor",
  detect({ projectPath, homePath }) {
    return (
      existsSync(join(projectPath, ".cursor")) ||
      existsSync(join(homePath, ".cursor"))
    );
  },
  install(descriptor, { projectPath, homePath }) {
    // Desktop/setup installs one Cursor descriptor. Prefer the project file when
    // the workspace has .cursor/; otherwise fall back to the user config.
    // Never leave murrmure in both — Cursor would show two identical servers.
    const projectConfigPath = join(projectPath, ".cursor", "mcp.json");
    const userConfigPath = join(homePath, ".cursor", "mcp.json");
    const useProject = existsSync(join(projectPath, ".cursor"));
    const configPath = useProject ? projectConfigPath : userConfigPath;
    const otherConfigPath = useProject ? userConfigPath : projectConfigPath;

    upsertMurrmureMcpServer(configPath, descriptorMcpServer(descriptor));
    const writtenPaths = [configPath];
    if (stripMurrmureMcpServer(otherConfigPath)) {
      writtenPaths.push(otherConfigPath);
    }

    const skill = installMurrmureSkill(homePath, { variant: "agent" });
    return {
      adapter_id: "cursor",
      mode: "written",
      paths: [...writtenPaths, ...skill.installed.map((entry) => entry.path)],
      reload_required: true,
    };
  },
};

const genericAdapter: ConnectionAdapter = {
  id: "generic",
  label: "Another MCP client (portable instructions)",
  detect() {
    return true;
  },
  install(descriptor) {
    const instructions = [
      "Add this server to your MCP client's native configuration:",
      JSON.stringify({ murrmure: descriptorMcpServer(descriptor) }, null, 2),
      `Install the ${descriptor.skills.bundle} skill bundle version ${descriptor.skills.version}.`,
      "Reload the client, then call murrmure_space_status.",
    ].join("\n\n");
    return {
      adapter_id: "generic",
      mode: "instructions",
      paths: [],
      reload_required: true,
      instructions,
    };
  },
};

export const CONNECTION_ADAPTERS: readonly ConnectionAdapter[] = [
  cursorAdapter,
  genericAdapter,
];

export function detectedConnectionAdapters(options: {
  projectPath: string;
  homePath?: string;
}): ConnectionAdapter[] {
  const homePath = options.homePath ?? homedir();
  const detected = CONNECTION_ADAPTERS.filter((adapter) =>
    adapter.id !== "generic"
      ? adapter.detect({ projectPath: options.projectPath, homePath })
      : false,
  );
  return detected.length > 0 ? detected : [genericAdapter];
}

export function findConnectionAdapter(id: string): ConnectionAdapter | undefined {
  return CONNECTION_ADAPTERS.find((adapter) => adapter.id === id);
}

export function setupResumePath(homePath: string = homedir()): string {
  return join(homePath, ".murrmure", "setup", "resume.json");
}

export function writeSetupResume(options: {
  descriptor: ConnectionDescriptor;
  adapters: string[];
  next: "reload-and-verify" | "complete";
  homePath?: string;
}): string {
  const path = setupResumePath(options.homePath);
  writeJsonAtomic(path, {
    version: 1,
    hub_id: options.descriptor.hub_id,
    connection_id: options.descriptor.connection_id,
    space_id: options.descriptor.space_id,
    adapters: options.adapters,
    next: options.next,
  });
  return path;
}
