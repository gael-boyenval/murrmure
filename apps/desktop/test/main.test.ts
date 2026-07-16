import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const mockStartHubSidecar = vi.fn();
const mockSubscribe = vi.fn();
const mockInstallMenus = vi.fn();

vi.mock("../src/runner.js", () => ({
  bootstrapLaunchUrl: vi.fn(() => "http://127.0.0.1:8787/"),
  startHubSidecar: (...args: unknown[]) => mockStartHubSidecar(...args),
}));

vi.mock("../src/notifications.js", () => ({
  handleMurrmureOpenUrl: vi.fn(),
  subscribeDesktopOutOfShellNotifications: (...args: unknown[]) => mockSubscribe(...args),
  shellRouteFromMurrmureDeepLink: vi.fn((url: string) => url),
}));

vi.mock("../src/menus.js", () => ({
  installDesktopMenu: (...args: unknown[]) => mockInstallMenus(...args),
}));

vi.mock("../src/session.js", () => ({
  createSessionInjectionScript: vi.fn(() => ""),
}));

vi.mock("electrobun", () => ({
  default: {
    events: {
      on: vi.fn(),
    },
  },
  app: {
    isCarrotMode: false,
    on: vi.fn(),
  },
  ApplicationMenu: {
    setApplicationMenu: vi.fn(),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    url: "http://127.0.0.1:8787/",
    webview: {
      on: vi.fn(),
      loadURL: vi.fn(),
      executeJavascript: vi.fn(),
    },
    on: vi.fn(),
    activate: vi.fn(),
    isMinimized: vi.fn(() => false),
    hidden: false,
  })),
  Utils: {
    showNotification: vi.fn(),
    showMessageBox: vi.fn(),
  },
}));

describe("runDesktopApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    mockStartHubSidecar.mockResolvedValue({
      paths: { hubUrl: "http://127.0.0.1:8787", dataDir: "/tmp/murrmure" },
      token: "tok_test",
      shutdown: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  test("continues launch when out-of-shell SSE subscription fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onceSpy = vi.spyOn(process, "once").mockImplementation(() => process);
    mockSubscribe.mockRejectedValue(new Error("SSE subscribe failed: 503"));

    const { runDesktopApp } = await import("../src/main.js");
    await expect(runDesktopApp()).resolves.toBeUndefined();

    expect(mockSubscribe).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      "Out-of-shell SSE notifications unavailable; desktop will continue without them.",
      expect.any(Error),
    );
    onceSpy.mockRestore();
  });
});
