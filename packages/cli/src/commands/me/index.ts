import { defineCommand, type CommandDef } from "citty";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { mapHubDenial } from "../../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";
import { runGlobalScopePreflight } from "../../lib/preflight.js";

export const meSetLandingCommand = defineCommand({
  meta: {
    name: "set-landing",
    description: "Set per-user landing space (Requires: space:enter · PATCH /v1/me)",
  },
  args: {
    ...globalArgs,
    space: {
      type: "string",
      description: "Landing space id (spc_…)",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const preflight = await runGlobalScopePreflight(flags, "space:enter");
    const spaceId = typeof args.space === "string" ? args.space : flags.space;
    if (!spaceId) {
      printErr("USAGE", "Missing --space spc_…");
    }

    const res = await hubFetch(preflight.auth, "/v1/me", {
      method: "PATCH",
      json: { landing_space_id: spaceId },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const denial = mapHubDenial(res.status, body);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }

    if (isJsonMode() || flags.json) {
      printOk(body);
      return;
    }
    printOk(body, `✓ Landing space set to ${spaceId}`);
  },
}) as CommandDef;

export const meCommand = defineCommand({
  meta: {
    name: "me",
    description: "User preferences (landing space)",
  },
  subCommands: {
    "set-landing": meSetLandingCommand,
  },
}) as CommandDef;
