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

export function buildMcpConfigSnippet(options?: {
  command?: string;
  hubId?: string;
  connectionId?: string;
}): string {
  return JSON.stringify(
    {
      mcpServers: {
        murrmure: {
          command: options?.command ?? "murrmure-mcp",
          ...(options?.hubId && options.connectionId
            ? {
                args: [
                  "--hub",
                  options.hubId,
                  "--connection",
                  options.connectionId,
                ],
              }
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
      const activePath = join(options.dataDir, "connections", "active.json");
      if (!existsSync(activePath)) {
        runtime.clipboardWriteText(
          "Run `mrmr connection create --space <spc_…>` before copying MCP config.",
        );
        return;
      }
      try {
        const active = JSON.parse(readFileSync(activePath, "utf8")) as {
          hub_id?: string;
          connection_id?: string;
        };
        runtime.clipboardWriteText(
          buildMcpConfigSnippet({
            command: options.mcpBridgeCommand ?? undefined,
            hubId: active.hub_id,
            connectionId: active.connection_id,
          }),
        );
      } catch {
        runtime.clipboardWriteText(
          "Active connection state is invalid. Run `mrmr connection activate` and retry.",
        );
      }
      return;
    }
    if (action === "desktop.openDataDir") {
      runtime.openPath(options.dataDir);
    }
  });
}
