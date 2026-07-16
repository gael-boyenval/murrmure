import { resolve } from "node:path";
import {
  defaultInstallPath,
  installMurrmureSkill,
  resolveSkillInstallVariant,
  readSkillVersion,
  type SkillInstallVariant,
} from "./install.js";

function parseVariant(value: unknown): SkillInstallVariant | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value);
  if (raw === "agent" || raw === "developer" || raw === "all") return raw;
  throw new Error(`Invalid --variant '${raw}'. Expected: agent, developer, all`);
}

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

export async function runMurrmureSkillCli(argv: string[]): Promise<void> {
  const { flags, command } = parseArgs(argv);
  const json = Boolean(flags.json);
  const target = typeof flags.dir === "string" ? resolve(String(flags.dir)) : process.cwd();

  switch (command) {
    case "install":
    case "update": {
      const variant = parseVariant(flags.variant);
      const result = installMurrmureSkill(target, { variant });
      const resolved = resolveSkillInstallVariant(target, variant);
      out(
        {
          ...result,
          variant: resolved,
          command,
          message:
            command === "update"
              ? `Updated murrmure ${resolved} skill variant`
              : `Installed murrmure ${resolved} skill variant`,
        },
        json,
      );
      break;
    }
    case "version": {
      const variant = flags.variant === "developer" ? "developer" : "agent";
      out(
        {
          ok: true,
          variant,
          version: readSkillVersion(variant),
          install_path: defaultInstallPath(target, variant),
        },
        json,
      );
      break;
    }
    default:
      out(
        {
          ok: false,
          code: "UNKNOWN_COMMAND",
          message: "Unknown command. Run `mrmr skill --help`.",
          version: readSkillVersion(),
        },
        json,
      );
      process.exit(1);
  }
}
