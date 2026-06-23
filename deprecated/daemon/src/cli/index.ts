#!/usr/bin/env node
import { runDaemon } from "./daemon";
import { runReview } from "./review";
import { runComment } from "./comment";
import { runMcp } from "./mcp";
import { daemonBaseUrl } from "../config";

const HELP = `studio — Agent Review Studio CLI

Usage:
  studio daemon start [--host <h>] [--port <p>]   Start the HTTP/SSE daemon
  studio review [--create] [--session <key>]      Block until human finishes review
                [--view <app>] [--url <url>]
  studio comment [--session <key>] [--reply-to <id>] [--author <name>]
                 [--resolve] [--json] [<body>]    Author replies / comments
  studio mcp                                       Run the stdio MCP server
  studio status                                    Show daemon + active session
`;

async function runStatus(): Promise<void> {
  const base = daemonBaseUrl();
  try {
    const health = await fetch(`${base}/api/health`);
    if (!health.ok) throw new Error();
  } catch {
    console.error(`Daemon not reachable at ${base}. Start it with \`pnpm dev\`.`);
    process.exit(1);
  }
  const sessions = await (await fetch(`${base}/api/sessions`)).json();
  console.log(JSON.stringify({ daemon: base, sessions }, null, 2));
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "daemon":
      return runDaemon(rest);
    case "review":
      return runReview(rest);
    case "comment":
      return runComment(rest);
    case "mcp":
      return runMcp();
    case "status":
      return runStatus();
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      process.stdout.write(HELP);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
