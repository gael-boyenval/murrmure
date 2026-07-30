import type { ApplicationMenuItemConfig } from "electrobun";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DesktopMenuRuntime {
  setApplicationMenu(menu: Array<ApplicationMenuItemConfig>): void;
  onApplicationMenuClicked(handler: (payload: unknown) => void): void;
  clipboardWriteText(text: string): void;
  openPath(path: string): void;
}

function getMenuAction(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = (payload as { action?: unknown }).action;
  return typeof candidate === "string" ? candidate : null;
}

function readActiveConnectionId(dataDir: string): string | undefined {
  const activePath = join(dataDir, "connections", "active.json");
  if (!existsSync(activePath)) return undefined;
  try {
    const value = JSON.parse(readFileSync(activePath, "utf8")) as {
      connection_id?: unknown;
    };
    return typeof value.connection_id === "string" &&
      value.connection_id.startsWith("con_")
      ? value.connection_id
      : undefined;
  } catch {
    return undefined;
  }
}

export function buildMcpConfigSnippet(options?: {
  command?: string;
  /** @deprecated Ignored. Hub is resolved from Desktop discovery. */
  hubId?: string;
  /** Connection id pinned as `--connection` (space). */
  connectionId?: string;
}): string {
  const connectionId = options?.connectionId?.trim();
  return JSON.stringify(
    {
      mcpServers: {
        murrmure: {
          command: options?.command ?? "murrmure-mcp",
          ...(connectionId?.startsWith("con_")
            ? { args: ["--connection", connectionId] }
            : {}),
        },
      },
    },
    null,
    2,
  );
}

export function installDesktopMenu(
  runtime: DesktopMenuRuntime,
  options: { hubUrl: string; dataDir: string; mcpBridgeCommand?: string | null },
): void {
  runtime.setApplicationMenu([
    {
      label: "Murrmure",
      submenu: [
        { label: "Copy MCP config", action: "desktop.copyMcpConfig", accelerator: "CmdOrCtrl+Shift+C" },
        { label: "Open data folder", action: "desktop.openDataDir" },
        { type: "divider" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "divider" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
  ]);

  runtime.onApplicationMenuClicked((payload) => {
    const action = getMenuAction(payload);
    if (!action) {
      return;
    }
    if (action === "desktop.copyMcpConfig") {
      const connectionId = readActiveConnectionId(options.dataDir);
      if (!connectionId) {
        runtime.clipboardWriteText(
          "Run `mrmr connection create --space <spc_…>` before copying MCP config.",
        );
        return;
      }
      runtime.clipboardWriteText(
        buildMcpConfigSnippet({
          command: options.mcpBridgeCommand ?? undefined,
          connectionId,
        }),
      );
      return;
    }
    if (action === "desktop.openDataDir") {
      runtime.openPath(options.dataDir);
    }
  });
}
