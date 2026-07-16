import { describe, expect, test } from "vitest";
import { handleMurrmureOpenUrl, shellRouteFromMurrmureDeepLink } from "../src/notifications.js";

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
});
