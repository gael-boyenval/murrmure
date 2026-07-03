import { describe, expect, test } from "vitest";
import {
  DESKTOP_PORT,
  parseHubPort,
  parseShellDevPort,
  resolveHubUrl,
  resolveShellDevUrl,
  SHELL_DEV_PORT,
} from "../src/dev-ports.js";

describe("dev-ports", () => {
  test("defaults hub port to 8787", () => {
    expect(parseHubPort({})).toBe(DESKTOP_PORT);
    expect(resolveHubUrl({})).toBe("http://127.0.0.1:8787");
  });

  test("reads PORT and HUB_PORT for hub", () => {
    expect(parseHubPort({ PORT: "9001" })).toBe(9001);
    expect(parseHubPort({ HUB_PORT: "9002" })).toBe(9002);
    expect(parseHubPort({ PORT: "9001", HUB_PORT: "9002" })).toBe(9001);
  });

  test("defaults shell dev port to 5174", () => {
    expect(parseShellDevPort({})).toBe(SHELL_DEV_PORT);
    expect(resolveShellDevUrl({})).toBe("http://127.0.0.1:5174");
  });

  test("reads VITE_PORT and SHELL_DEV_PORT for shell", () => {
    expect(parseShellDevPort({ VITE_PORT: "5199" })).toBe(5199);
    expect(parseShellDevPort({ SHELL_DEV_PORT: "5200" })).toBe(5200);
    expect(parseShellDevPort({ VITE_PORT: "5199", SHELL_DEV_PORT: "5200" })).toBe(5199);
  });
});
