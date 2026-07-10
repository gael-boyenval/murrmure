import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { cliConsola, isJsonMode, printErr, printOk } from "../../lib/output.js";
import {
  listViewFixtures,
  resolveInitialFixture,
  resolveViewDevPaths,
  startViewDevProcess,
  writeViewDevSession,
} from "../../lib/view-dev.js";
import { resolveMurrmureRootFromCwd } from "../../lib/view-scaffold.js";

export const viewDevCommand = defineCommand({
  meta: {
    name: "dev",
    description: "Run view dev server with fixture context (Requires: scripts.dev, dev/fixtures/)",
  },
  args: {
    ...globalArgs,
    id: {
      type: "positional",
      description: "View id under .mrmr/views/",
      required: true,
    },
    fixture: {
      type: "string",
      description: "Initial fixture tab name (e.g. gate-round-1)",
    },
    "space-root": {
      type: "string",
      description: "Space root containing .mrmr/ (default: cwd)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const viewId = typeof args.id === "string" ? args.id : undefined;
    if (!viewId) {
      printErr("MISSING_ARG", "View id required — run `mrmr view dev <id>`");
    }

    try {
      const spaceRootArg =
        typeof args["space-root"] === "string" && args["space-root"]
          ? resolve(args["space-root"])
          : undefined;
      const murrmureRoot = resolveMurrmureRootFromCwd(process.cwd(), spaceRootArg);
      const { viewDir, spaceRoot: resolvedSpaceRoot } = resolveViewDevPaths(murrmureRoot, viewId);
      const fixtures = listViewFixtures(viewDir);
      const initialFixture = resolveInitialFixture(
        fixtures,
        typeof args.fixture === "string" ? args.fixture : undefined,
      );

      const handle = startViewDevProcess(viewDir);
      const devUrl = await handle.devUrl;

      const sessionPath = writeViewDevSession(resolvedSpaceRoot, {
        view_id: viewId,
        view_dir: viewDir,
        dev_url: devUrl,
        fixtures: fixtures.map((f) => ({ name: f.name, path: f.path })),
        initial_fixture: initialFixture.name,
        started_at: new Date().toISOString(),
      });

      if (isJsonMode() || flags.json) {
        printOk({
          view_id: viewId,
          dev_url: devUrl,
          fixtures: fixtures.map((f) => f.name),
          initial_fixture: initialFixture.name,
          session_path: sessionPath,
        });
        handle.stop();
        return;
      }

      printOk({}, `✓ View dev server ${devUrl}`);
      cliConsola.info(`Fixtures: ${fixtures.map((f) => f.name).join(", ")}`);
      cliConsola.info(`Initial tab: ${initialFixture.name}`);
      cliConsola.info(`Session: ${sessionPath}`);
      cliConsola.info(
        `ViewCanvasHost dev route: /spaces/<space_id>/dev/views/${viewId} (open in Desktop after linking space)`,
      );
      cliConsola.info("Submit logs here in dev mode — no gate resolve until a real run.");
      cliConsola.info("Press Ctrl+C to stop.");

      await new Promise<void>((resolvePromise) => {
        const onSignal = () => {
          handle.stop();
          resolvePromise();
        };
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
        handle.child.on("exit", () => resolvePromise());
      });
    } catch (error) {
      printErr("VIEW_DEV_FAILED", error instanceof Error ? error.message : "View dev failed");
    }
  },
}) as CommandDef;
