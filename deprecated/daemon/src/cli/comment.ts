import type { SessionSummary } from "@studio/review-contracts";
import { parseArgs, flagBool, flagString } from "./args";
import { daemonBaseUrl } from "../config";

async function resolveSessionKey(base: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const response = await fetch(`${base}/api/sessions`);
  const summaries = (await response.json()) as SessionSummary[];
  if (summaries.length === 0) {
    console.error("No active session. Pass --session <key>.");
    process.exit(1);
  }
  return summaries[0].session_key;
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Author replies (and top-level comments) from the agent. Crit-compatible:
 * `--reply-to`, `--author`, `--json` bulk mode, `--resolve`.
 */
export async function runComment(argv: string[]): Promise<void> {
  const { positional, flags } = parseArgs(argv);
  const base = daemonBaseUrl();
  const author = flagString(flags, "author") ?? "Agent";
  const key = await resolveSessionKey(base, flagString(flags, "session"));

  if (flagBool(flags, "json")) {
    const payload = JSON.parse(await readStdin()) as Array<{
      reply_to: string;
      body: string;
    }>;
    for (const entry of payload) {
      await fetch(`${base}/api/sessions/${key}/comments/${entry.reply_to}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ author, body: entry.body }),
      });
    }
    console.error(`Posted ${payload.length} repl${payload.length === 1 ? "y" : "ies"}.`);
    return;
  }

  const replyTo = flagString(flags, "reply-to");
  const resolve = flagBool(flags, "resolve");
  const body = positional.join(" ").trim();

  if (replyTo) {
    if (body) {
      await fetch(`${base}/api/sessions/${key}/comments/${replyTo}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ author, body }),
      });
    }
    if (resolve) {
      await fetch(`${base}/api/sessions/${key}/comments/${replyTo}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
    }
    console.error(`Replied to ${replyTo}.`);
    return;
  }

  if (!body) {
    console.error("Nothing to do. Provide a comment body or --reply-to <id>.");
    process.exit(1);
  }

  const thread = flagString(flags, "thread") ?? "/";
  await fetch(`${base}/api/sessions/${key}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ thread, body, author }),
  });
  console.error(`Added comment to ${key}.`);
}
