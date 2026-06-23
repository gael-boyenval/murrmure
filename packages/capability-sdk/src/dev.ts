import { watch } from "node:fs";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCapabilityRoot } from "./build.js";
import { startDevSimServer, type DevSimServerHandle } from "./dev-sim/server.js";
import { parseFixture, type DevSimFixture } from "./dev-sim/state-machine.js";
import { pushCapability, evolutionCommand, readPushState } from "./push.js";
import { validateCapabilityRoot } from "./validate.js";

export interface DevOptions {
  spaceId?: string;
  path?: string;
  autoApply?: boolean;
  debounceMs?: number;
  sim?: boolean;
  simPort?: number;
  simFixture?: string;
}

export interface DevLoopHandle {
  stop: () => void;
  simUrl?: string;
}

function readContract(sourceDir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(sourceDir, "contract", "contract.json"), "utf-8")) as unknown;
  } catch {
    return {};
  }
}

export async function devCapabilityLoop(opts: DevOptions): Promise<DevLoopHandle> {
  const sourceDir = resolve(opts.path ?? ".");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastDigest = "";
  let simRuntime: DevSimServerHandle | null = null;
  let simUrl: string | undefined;
  const fixture: DevSimFixture | undefined = parseFixture(opts.simFixture);

  const run = async () => {
    const validation = validateCapabilityRoot(sourceDir);
    if (!validation.ok) {
      console.error(JSON.stringify({ ok: false, errors: validation.errors }));
      return;
    }
    const built = await buildCapabilityRoot(sourceDir);
    if (!built.ok) {
      console.error(JSON.stringify({ ok: false, errors: built.errors }));
      return;
    }
    if (opts.sim) {
      const manifest = validation.manifest;
      if (!manifest) {
        console.error(
          JSON.stringify({
            ok: false,
            errors: [{ code: "MANIFEST_INVALID", message: "Manifest not available for simulator" }],
          }),
        );
        return;
      }
      const contract = readContract(sourceDir);
      if (!simRuntime) {
        simRuntime = await startDevSimServer({
          port: opts.simPort ?? 4310,
          sourceDir,
          stageDir: built.stageDir,
          manifest: {
            id: manifest.id,
            version: manifest.version,
            routes_prefix: manifest.routes_prefix,
            ui: { canvas_route: manifest.ui.canvas_route },
          },
          contract,
          fixture,
          bundleDigest: built.bundleDigest,
        });
        simUrl = simRuntime.url;
        console.log(
          JSON.stringify({
            ok: true,
            command: "dev_sim_ready",
            url: simRuntime.url,
            bundle_digest: built.bundleDigest,
          }),
        );
        lastDigest = built.bundleDigest;
        return;
      }

      if (built.bundleDigest === lastDigest) {
        return;
      }

      simRuntime.reload({
        sourceDir,
        stageDir: built.stageDir,
        manifest: {
          id: manifest.id,
          version: manifest.version,
          routes_prefix: manifest.routes_prefix,
          ui: { canvas_route: manifest.ui.canvas_route },
        },
        contract,
        fixture,
        bundleDigest: built.bundleDigest,
      });
      lastDigest = built.bundleDigest;
      console.log(
        JSON.stringify({
          ok: true,
          command: "dev_reload",
          mode: "sim",
          url: simRuntime.url,
          bundle_digest: built.bundleDigest,
        }),
      );
      return;
    }

    if (!opts.spaceId) {
      console.error(
        JSON.stringify({
          ok: false,
          errors: [{ code: "MISSING_FLAG", message: "--space required unless --sim is used" }],
        }),
      );
      return;
    }

    if (built.bundleDigest === lastDigest) return;
    lastDigest = built.bundleDigest;

    const pushed = await pushCapability({ spaceId: opts.spaceId, path: sourceDir });
    if (!pushed.ok) {
      console.error(JSON.stringify(pushed));
      return;
    }

    if (opts.autoApply && validation.manifest) {
      const state = readPushState(validation.manifest.id, validation.manifest.version);
      if (state?.install_id) {
        await evolutionCommand("apply", { spaceId: opts.spaceId, installId: state.install_id });
      }
    }
    console.log(JSON.stringify({ ok: true, command: "dev_reload", bundle_digest: built.bundleDigest }));
  };

  await run();
  const watcher = watch(sourceDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), opts.debounceMs ?? 300);
  });

  return {
    stop: () => {
      watcher.close();
      clearTimeout(timer);
      if (simRuntime) {
        void simRuntime.stop().catch((error) => {
          console.error(JSON.stringify({ ok: false, code: "SIM_RUNTIME_STOP_FAILED", message: String(error) }));
        });
      }
    },
    simUrl,
  };
}
