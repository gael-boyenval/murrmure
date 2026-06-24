import { writeFileSync } from "node:fs";
import { defineCommand, type CommandDef } from "citty";
import { hubFetch } from "../auth.js";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { mapHubDenial } from "../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../lib/output.js";
import { runGlobalScopePreflight } from "../lib/preflight.js";
import { emitHubConfigJson, printHubConfigData } from "../lib/space-output.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

export const hubFederationCommand = defineCommand({
  meta: {
    name: "federation",
    description: `Show federation relay status ${requiresLine("space:admin")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth } = await runGlobalScopePreflight(flags, "space:admin");

    const res = await hubFetch(auth, "/v1/ops/federation/status");
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const hubGrantsExportCommand = defineCommand({
  meta: {
    name: "grants-export",
    description: `Export hub-wide grants ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    out: {
      type: "string",
      description: "Write export JSON to file instead of stdout",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth } = await runGlobalScopePreflight(flags, "space:admin");

    const res = await hubFetch(auth, "/v1/ops/grants/export");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const denial = mapHubDenial(res.status, body);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }

    const text = await res.text();
    const outPath = typeof args.out === "string" && args.out ? args.out : undefined;

    if (outPath) {
      writeFileSync(outPath, text);
      if (isJsonMode()) {
        printOk({ ok: true, path: outPath });
      } else {
        printOk({}, `✓ Exported grants to ${outPath}`);
      }
      return;
    }

    process.stdout.write(text);
    if (!text.endsWith("\n") && text.length > 0) {
      process.stdout.write("\n");
    }
  },
}) as CommandDef;

export const hubCommand = defineCommand({
  meta: { name: "hub", description: "Hub operator commands" },
  subCommands: {
    federation: hubFederationCommand,
    "grants-export": hubGrantsExportCommand,
  },
}) as CommandDef;
