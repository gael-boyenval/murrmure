import { defineCommand, type CommandDef } from "citty";
import { hubFetch } from "../auth.js";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { mapHubDenial } from "../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../lib/output.js";
import { runGlobalScopePreflight } from "../lib/preflight.js";
import { hubFederationCommand } from "./hub.js";

export const federationPeerAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "Register a federation peer hub (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    id: { type: "string", description: "Peer hub id (e.g. hub_b)" },
    url: { type: "string", description: "Peer hub base URL" },
    token: { type: "string", description: "Optional bearer token for peer health/invoke" },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const hub_id = String(args.id ?? "");
    const url = String(args.url ?? "");
    if (!hub_id || !url) {
      printErr("USAGE", "Both --id and --url are required");
    }

    const { auth } = await runGlobalScopePreflight(flags, "space:admin");
    const res = await hubFetch(auth, "/v1/ops/federation/peers", {
      method: "POST",
      json: {
        hub_id,
        url,
        auth_token: typeof args.token === "string" ? args.token : undefined,
      },
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
    printOk(body, `✓ Registered peer ${hub_id} → ${url}`);
  },
}) as CommandDef;

export const federationCommand = defineCommand({
  meta: { name: "federation", description: "Federation peer management" },
  subCommands: {
    status: hubFederationCommand,
    peer: defineCommand({
      meta: { name: "peer", description: "Peer hub commands" },
      subCommands: { add: federationPeerAddCommand },
    }) as CommandDef,
  },
}) as CommandDef;
