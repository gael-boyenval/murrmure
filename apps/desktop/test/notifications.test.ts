import { describe, expect, test, vi } from "vitest";
import {
  handleMurrmureOpenUrl,
  shellRouteFromMurrmureDeepLink,
  subscribeDesktopOutOfShellNotifications,
} from "../src/notifications.js";

describe("desktop notifications", () => {
  test("shellRouteFromMurrmureDeepLink maps run + gate", () => {
    expect(shellRouteFromMurrmureDeepLink("murrmure://runs/run_abc?gate=chk_gate1")).toBe(
      "/runs/run_abc?gate=chk_gate1",
    );
  });

  test("handleMurrmureOpenUrl navigates murrmure scheme", () => {
    const routes: string[] = [];
    const handled = handleMurrmureOpenUrl("murrmure://runs/run_1?gate=chk_x", (r) => routes.push(r));
    expect(handled).toBe(true);
    expect(routes).toEqual(["/runs/run_1?gate=chk_x"]);
  });

  test("subscribeDesktopOutOfShellNotifications wires deep_link on out_of_shell.desktop", async () => {
    const sseBody = [
      'event: out_of_shell.desktop',
      'data: {"actor_id":"usr_1","kind":"gate","title":"Approve","deep_link":"murrmure://runs/run_abc?gate=chk_gate1"}',
      "",
      "",
    ].join("\n");

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/sse-ticket") && init?.method === "POST") {
        return new Response(JSON.stringify({ ticket: "tkt_test" }), { status: 200 });
      }
      if (url.includes("/v1/journal/subscribe")) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const navigateToDeepLink = vi.fn();
    const showNotification = vi.fn();

    const stop = await subscribeDesktopOutOfShellNotifications({
      hubUrl: "http://127.0.0.1:8787",
      token: "tok_test",
      currentActorId: "usr_1",
      fetchImpl,
      navigateToDeepLink,
      showNotification,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    stop();

    expect(navigateToDeepLink).toHaveBeenCalledWith("murrmure://runs/run_abc?gate=chk_gate1");
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Approve",
        deepLink: "murrmure://runs/run_abc?gate=chk_gate1",
      }),
    );
  });

  test("subscribeDesktopOutOfShellNotifications ignores other actors", async () => {
    const sseBody = [
      'event: out_of_shell.desktop',
      'data: {"actor_id":"usr_other","kind":"gate","title":"Ignore me","deep_link":"murrmure://runs/run_xyz?gate=chk_gate9"}',
      "",
      "",
    ].join("\n");

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/sse-ticket") && init?.method === "POST") {
        return new Response(JSON.stringify({ ticket: "tkt_test" }), { status: 200 });
      }
      if (url.includes("/v1/journal/subscribe")) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const navigateToDeepLink = vi.fn();
    const showNotification = vi.fn();

    const stop = await subscribeDesktopOutOfShellNotifications({
      hubUrl: "http://127.0.0.1:8787",
      token: "tok_test",
      currentActorId: "usr_1",
      fetchImpl,
      navigateToDeepLink,
      showNotification,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    stop();

    expect(navigateToDeepLink).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });
});
