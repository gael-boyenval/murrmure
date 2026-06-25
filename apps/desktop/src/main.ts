import { app, ApplicationMenu, BrowserWindow, Utils } from "electrobun";
import { reportStartupFailure } from "./errors.js";
import { installDesktopMenu } from "./menus.js";
import { bootstrapLaunchUrl, startHubSidecar } from "./runner.js";
import { createSessionInjectionScript } from "./session.js";

let mainWindow: BrowserWindow | null = null;
let shutdownHub: (() => Promise<void>) | null = null;

async function safeShowMessageBox(options: Parameters<typeof Utils.showMessageBox>[0]): Promise<void> {
  if (app.isCarrotMode) {
    return;
  }
  try {
    await Utils.showMessageBox(options);
  } catch (error) {
    console.error("Failed to display desktop dialog.", error);
  }
}

function installMenus(hubUrl: string, dataDir: string): void {
  installDesktopMenu(
    {
      setApplicationMenu: ApplicationMenu.setApplicationMenu,
      onApplicationMenuClicked: (handler) =>
        ApplicationMenu.on("application-menu-clicked", (event) => {
          const payload = event && typeof event === "object" && "data" in (event as Record<string, unknown>)
            ? (event as { data: unknown }).data
            : event;
          handler(payload);
        }),
      clipboardWriteText: Utils.clipboardWriteText,
      openPath: (path) => {
        const opened = Utils.openPath(path);
        if (!opened) {
          console.error(`Failed to open path: ${path}`);
        }
      },
    },
    { hubUrl, dataDir },
  );
}

function createWindow(hubUrl: string, token: string): BrowserWindow {
  const window = new BrowserWindow({
    title: "Murrmure",
    frame: { x: 64, y: 64, width: 1400, height: 920 },
    renderer: "native",
    titleBarStyle: "default",
    url: bootstrapLaunchUrl(hubUrl, token),
  });

  const injectionScript = createSessionInjectionScript(token, hubUrl);
  let bootstrapped = false;
  window.webview.on("dom-ready", () => {
    if (bootstrapped) {
      return;
    }
    bootstrapped = true;
    window.webview.executeJavascript(injectionScript);
  });

  window.on("close", () => {
    void shutdownHub?.();
  });
  return window;
}

export async function runDesktopApp(): Promise<void> {
  if (app.isCarrotMode) {
    console.error(
      "Electrobun native APIs are unavailable. Use `pnpm desktop:dev` (system browser) or launch a built .app bundle.",
    );
    process.exit(1);
    return;
  }

  let handle: Awaited<ReturnType<typeof startHubSidecar>>;
  try {
    handle = await startHubSidecar({ mode: "prod" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already running")) {
      console.log(message);
      await safeShowMessageBox({
        type: "info",
        title: "Murrmure already running",
        message,
      });
      process.exit(0);
      return;
    }
    throw error;
  }

  shutdownHub = handle.shutdown;

  const handleTermination = () => {
    void handle.shutdown().finally(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", handleTermination);
  process.once("SIGTERM", handleTermination);

  installMenus(handle.paths.hubUrl, handle.paths.dataDir);
  mainWindow = createWindow(handle.paths.hubUrl, handle.token);

  app.on("before-quit", () => {
    void handle.shutdown();
  });
}

if (import.meta.main) {
  void runDesktopApp().catch(async (error) => {
    await shutdownHub?.();
    await reportStartupFailure("Unable to start Murrmure desktop.", {
      cause: error,
      showDialog: async ({ title, message, detail }) => {
        await safeShowMessageBox({
          type: "error",
          title,
          message,
          detail,
          buttons: ["Quit"],
        });
      },
    });
    process.exit(1);
  });
}
