import type { ApplicationMenuItemConfig } from "electrobun";

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

export function buildMcpConfigSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        murrmure: {
          command: "murrmure-mcp",
          env: {
            MURRMURE_HUB_TOKEN: "tok_<replace_with_grant_token>",
          },
        },
      },
    },
    null,
    2,
  );
}

export function installDesktopMenu(
  runtime: DesktopMenuRuntime,
  options: { hubUrl: string; dataDir: string },
): void {
  const mcpSnippet = buildMcpConfigSnippet();

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
      runtime.clipboardWriteText(mcpSnippet);
      return;
    }
    if (action === "desktop.openDataDir") {
      runtime.openPath(options.dataDir);
    }
  });
}
