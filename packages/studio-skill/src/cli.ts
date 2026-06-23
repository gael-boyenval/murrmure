#!/usr/bin/env node
import { resolve } from "node:path";
import { defaultInstallPath, installStudioSkill, readSkillVersion } from "./install.js";

function parseArgs(argv: string[]) {
  const args = [...argv];
  const flags: Record<string, string | boolean> = { json: false };
  const positional: string[] = [];
  while (args.length) {
    const a = args.shift()!;
    if (a === "--json") flags.json = true;
    else if (a.startsWith("--") && a.includes("=")) {
      const [k, v] = a.slice(2).split("=", 2);
      flags[k!] = v!;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[0];
      if (next && !next.startsWith("--")) flags[key] = args.shift()!;
      else flags[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional, command: positional[0] };
}

function out(data: unknown, json: boolean) {
  console.log(JSON.stringify(data, null, json ? 2 : 0));
  if (typeof data === "object" && data && "ok" in data && !(data as { ok: boolean }).ok) {
    process.exit(1);
  }
}

export async function runSkillCli(argv: string[]): Promise<void> {
  const { flags, command } = parseArgs(argv);
  const json = Boolean(flags.json);
  const target = typeof flags.dir === "string" ? resolve(String(flags.dir)) : process.cwd();

  switch (command) {
    case "install":
    case "update": {
      const result = installStudioSkill(target);
      out(
        {
          ...result,
          command,
          message:
            command === "update"
              ? `Updated studio-capability skill to v${result.version}`
              : `Installed studio-capability skill to ${result.path}`,
        },
        json,
      );
      break;
    }
    case "version": {
      out({ ok: true, version: readSkillVersion(), install_path: defaultInstallPath(target) }, json);
      break;
    }
    default:
      out(
        {
          ok: false,
          code: "UNKNOWN_COMMAND",
          message: "usage: studio skill <install|update|version> [--dir path] [--json]",
          version: readSkillVersion(),
        },
        json,
      );
      process.exit(1);
  }
}

async function main() {
  const [, , command, ...rest] = process.argv;
  await runSkillCli([command, ...rest].filter((a): a is string => Boolean(a)));
}

void main();
