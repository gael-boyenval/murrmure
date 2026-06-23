import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devFlowLoop, initFlow } from "../src/flow-commands.js";
import { linkScaffoldWorkspaceDeps } from "./helpers/link-scaffold-deps.js";

describe("dev --sim", () => {
  test("starts thin server with install + instance state machine", async () => {
    const base = mkdtempSync(join(tmpdir(), "cap-sdk-dev-sim-"));
    const dir = join(base, "demo-sim");
    let loop: { stop: () => void; simUrl?: string } | undefined;
    try {
      initFlow("demo-sim", dir);
      linkScaffoldWorkspaceDeps(dir);
      loop = await devFlowLoop({
        path: dir,
        sim: true,
        simPort: 0,
        debounceMs: 50,
      });
      expect(loop.simUrl).toBeTruthy();

      const installResponse = await fetch(`${loop.simUrl}/sim/install`);
      const installBody = (await installResponse.json()) as {
        ok: boolean;
        install?: { state: string };
      };
      expect(installResponse.ok).toBe(true);
      expect(installBody.ok).toBe(true);
      expect(installBody.install?.state).toBe("live");

      const fixtureResponse = await fetch(`${loop.simUrl}/sim/fixtures/pending-review/apply`, {
        method: "POST",
      });
      expect(fixtureResponse.ok).toBe(true);

      const transitionResponse = await fetch(`${loop.simUrl}/sim/install/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      });
      const transitionBody = (await transitionResponse.json()) as {
        ok: boolean;
        install?: { state: string };
      };
      expect(transitionResponse.ok).toBe(true);
      expect(transitionBody.ok).toBe(true);
      expect(transitionBody.install?.state).toBe("validated");

      const healthResponse = await fetch(`${loop.simUrl}/api/demo-sim/health`);
      expect(healthResponse.ok).toBe(true);
      const healthBody = (await healthResponse.json()) as { ok?: boolean; flow?: string };
      expect(healthBody.ok).toBe(true);
      expect(healthBody.flow).toBe("demo-sim");
    } finally {
      loop?.stop();
      rmSync(base, { recursive: true, force: true });
    }
  });
});

