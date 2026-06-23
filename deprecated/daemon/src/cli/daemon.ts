import { parseArgs, flagString } from "./args";
import { startServer } from "../server";
import { daemonHost, daemonPort, webBaseUrl } from "../config";

export async function runDaemon(argv: string[]): Promise<void> {
  const { positional, flags } = parseArgs(argv);
  const action = positional[0] ?? "start";
  if (action !== "start") {
    console.error(`Unknown daemon action: ${action}. Use \`studio daemon start\`.`);
    process.exit(1);
  }

  const host = flagString(flags, "host") ?? daemonHost();
  const port = flags.port ? Number(flagString(flags, "port")) : daemonPort();

  await startServer({ host, port });
  console.error(`[studio] daemon listening on http://${host}:${port}`);
  console.error(`[studio] web UI expected at ${webBaseUrl()}`);
}
