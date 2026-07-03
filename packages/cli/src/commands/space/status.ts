import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { mapHubDenial } from "../../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { readSpaceLink } from "../../lib/space-link-file.js";

export const spaceStatusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show indexed murrmure/ counts and digests (Requires: space:read)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root (default: .) — used to resolve linked space",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const projectPath = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());
    const link = readSpaceLink(projectPath);
    const spaceId = flags.space ?? link?.space_id;
    if (!spaceId) {
      printErr("USAGE", "Missing --space — run `mrmr space link` first");
    }

    const { auth } = await runScopePreflight(flags, "space:read", spaceId);
    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/index/status`);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const denial = mapHubDenial(res.status, body);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }

    if (isJsonMode() || flags.json) {
      printOk(body);
      return;
    }

    const counts = body.counts as Record<string, number> | undefined;
    console.log(`Space ${spaceId}`);
    console.log(`  actions:   ${counts?.actions ?? 0}`);
    console.log(`  executors: ${counts?.executors ?? 0}`);
    console.log(`  hooks:     ${counts?.hooks ?? 0}`);
    console.log(`  flows:     ${counts?.flows ?? 0}`);
    const bindings = body.bindings as Array<{ host: string; path: string }> | undefined;
    if (bindings?.length) {
      console.log("  bindings:");
      for (const b of bindings) {
        console.log(`    ${b.host}:${b.path}`);
      }
    }
  },
}) as CommandDef;
