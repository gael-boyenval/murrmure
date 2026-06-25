/**
 * Dev desktop launcher — hub sidecar + system browser.
 * Does not import Electrobun (avoids carrot-mode RPC noise when running via plain `bun`).
 */
import { reportStartupFailure } from "./errors.js";
import { bootstrapLaunchUrl, openInSystemBrowser, startHubSidecar } from "./runner.js";

async function runDevDesktop(): Promise<void> {
  const handle = await startHubSidecar({ mode: "dev" });
  const launchUrl = bootstrapLaunchUrl(handle.paths.hubUrl, handle.token);

  console.log(`Murrmure hub running at ${handle.paths.hubUrl}`);
  console.log("Opening in your default browser…");
  console.log("Press Ctrl+C to stop the hub.");

  await openInSystemBrowser(launchUrl);

  const onSignal = () => {
    void handle.shutdown().finally(() => process.exit(0));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  await handle.hubProcess.exited;
}

if (import.meta.main) {
  void runDevDesktop().catch(async (error) => {
    await reportStartupFailure("Unable to start Murrmure desktop (dev mode).", { cause: error });
    process.exit(1);
  });
}
