import { defineCommand, type CommandDef } from "citty";
import { DEFAULT_HUB_URL } from "../auth.js";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { printErr, printOk } from "../lib/output.js";

type HealthPayload = {
  status?: string;
  version?: string;
  uptime_s?: number;
  flows?: number;
};

export const healthCommand = defineCommand({
  meta: {
    name: "health",
    description: "Hub health check (Requires: none)",
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const hubUrl = (flags.hubUrl ?? DEFAULT_HUB_URL).replace(/\/$/, "");

    const res = await fetch(`${hubUrl}/v1/health`);
    const body = (await res.json().catch(() => ({}))) as HealthPayload;

    if (!res.ok) {
      printErr("HUB_ERROR", `Health check failed with status ${res.status}`);
    }

    if (flags.json) {
      printOk(body as Record<string, unknown>);
      return;
    }

    const status = body.status ?? "unknown";
    const version = body.version ?? "?";
    const uptime = body.uptime_s ?? "?";
    const flows = body.flows ?? "?";
    console.log(`Hub ${status} · version ${version} · uptime ${uptime}s · ${flows} flows`);
  },
}) as CommandDef;
