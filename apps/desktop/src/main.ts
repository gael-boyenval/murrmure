import Electrobun, { app, ApplicationMenu, BrowserWindow, Utils } from "electrobun";
import { reportStartupFailure } from "./errors.js";
import { installDesktopMenu } from "./menus.js";
import {
  handleMurrmureOpenUrl,
  subscribeDesktopOutOfShellNotifications,
  shellRouteFromMurrmureDeepLink,
} from "./notifications.js";
import { bootstrapLaunchUrl, connectDevHmrServices, startHubSidecar } from "./runner.js";
import { createSessionInjectionScript } from "./session.js";
import { isDesktopDevHmrMode } from "./paths.js";

let mainWindow: BrowserWindow | null = null;
let shutdownHub: (() => Promise<void>) | null = null;
let stopNotifications: (() => void) | null = null;

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

function installMenus(hubUrl: string, dataDir: string, mcpBridgeCommand?: string | null): void {
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
    { hubUrl, dataDir, mcpBridgeCommand },
  );
}

function navigateShellRoute(route: string): void {
  if (!mainWindow) return;
  const hubOrigin = mainWindow.url ? new URL(mainWindow.url).origin : "";
  const target = route.startsWith("http") ? route : `${hubOrigin}${route.startsWith("/") ? route : `/${route}`}`;
  mainWindow.webview.loadURL(target);
}

function createWindow(launchUrl: string, token: string, hubUrl: string): BrowserWindow {
  const window = new BrowserWindow({
    title: "Murrmure",
    frame: { x: 64, y: 64, width: 1400, height: 920 },
    renderer: "native",
    titleBarStyle: "default",
    url: bootstrapLaunchUrl(launchUrl, token),
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

export async function bootstrapDesktopApp(): Promise<void> {
  if (app.isCarrotMode) {
    console.error(
      "Electrobun native APIs are unavailable. Use `pnpm desktop:dev` (system browser) or launch a built .app bundle.",
    );
    process.exit(1);
    return;
  }

  let handle: Awaited<ReturnType<typeof startHubSidecar>>;
  try {
    handle = isDesktopDevHmrMode()
      ? await connectDevHmrServices()
      : await startHubSidecar({ mode: "prod" });
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

  installMenus(handle.paths.hubUrl, handle.paths.dataDir, handle.paths.mcpBridgeEntry);
  const launchUrl = handle.paths.shellWebUrl ?? handle.paths.hubUrl;
  mainWindow = createWindow(launchUrl, handle.token, handle.paths.hubUrl);

  Electrobun.events.on("open-url", (event) => {
    const url = event.data.url;
    handleMurrmureOpenUrl(url, (route) => {
      mainWindow?.activate();
      navigateShellRoute(route);
    });
  });

  try {
    if (!isDesktopDevHmrMode()) {
      stopNotifications = await subscribeDesktopOutOfShellNotifications({
        hubUrl: handle.paths.hubUrl,
        token: handle.token,
        isShellFocused: () => {
          if (!mainWindow) return false;
          return !mainWindow.isMinimized() && !mainWindow.hidden;
        },
        showNotification: (opts) => Utils.showNotification(opts),
        navigateToDeepLink: (deepLink) => navigateShellRoute(shellRouteFromMurrmureDeepLink(deepLink)),
      });
    }
  } catch (error) {
    console.warn(
      "Out-of-shell SSE notifications unavailable; desktop will continue without them.",
      error,
    );
  }

  app.on("before-quit", () => {
    stopNotifications?.();
    void handle.shutdown();
  });
}

/** @deprecated Use bootstrapDesktopApp — kept for tests. */
export const runDesktopApp = bootstrapDesktopApp;
