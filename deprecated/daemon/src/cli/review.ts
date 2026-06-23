import { type View } from "@studio/review-contracts";
import { parseArgs, flagBool, flagString } from "./args";
import { daemonBaseUrl, fixtureUrl, webBaseUrl } from "../config";

/**
 * Blocking review loop. Creates a session (or resumes one), then long-polls the
 * daemon until the human clicks Finish. Final JSON goes to stdout for the agent;
 * human-facing guidance goes to stderr.
 */
export async function runReview(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);
  const base = daemonBaseUrl();

  try {
    const health = await fetch(`${base}/api/health`);
    if (!health.ok) throw new Error("unhealthy");
  } catch {
    console.error(
      "Studio daemon is not running. Start it with `pnpm dev` (daemon + web) or `studio daemon start`.",
    );
    process.exit(1);
  }

  let key = flagString(flags, "session");
  const create = flagBool(flags, "create") || !key;

  if (create) {
    const view = (flagString(flags, "view") ?? "app") as View;
    const url = flagString(flags, "url") ?? fixtureUrl();
    const response = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ view, url }),
    });
    if (!response.ok) {
      console.error(`Failed to create session: ${response.status} ${await response.text()}`);
      process.exit(1);
    }
    const session = (await response.json()) as { session_key: string };
    key = session.session_key;
  }

  console.error(`Studio is open at ${webBaseUrl()}/sessions/${key}`);
  console.error('Leave comments in the browser, then click "Finish Review".');

  // Resilient long-poll: re-issue on timeout or transient disconnect. The
  // daemon's round-complete signal is idempotent, so retries are safe.
  while (true) {
    let data: { status: string } & Record<string, unknown>;
    try {
      const response = await fetch(`${base}/api/sessions/${key}/review-cycle`, {
        method: "POST",
      });
      data = (await response.json()) as typeof data;
    } catch {
      continue;
    }

    if (data.status === "timeout") continue;

    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    process.exit(data.status === "shutdown" ? 1 : 0);
  }
}
