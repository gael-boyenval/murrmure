import { defineCommand, type CommandDef } from "citty";
import { formatDoctorHuman, runDoctor } from "../../lib/doctor.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { formatStatusHuman } from "../../lib/flow-formatters.js";
import { emitFlowResult } from "../../lib/flow-output.js";
import { hubFetch } from "../../lib/hub-request.js";
import { runScopePreflight, resolveHubAuthOrExit } from "../../lib/preflight.js";
import { readSpaceLink } from "../../lib/space-link-file.js";
import { resolve } from "node:path";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

export const flowStatusCommand = defineCommand({
  meta: {
    name: "status",
    description: `Show indexed flow state on hub ${requiresLine("space:read")}`,
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root (default: .) — used to resolve linked space",
    },
    "flow-id": {
      type: "string",
      description: "Flow id to inspect (default: list all indexed flows)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const projectPath = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());
    const link = readSpaceLink(projectPath);
    const spaceId = flags.space ?? link?.space_id;
    if (!spaceId) {
      emitFlowResult({
        ok: false,
        code: "SPACE_REQUIRED",
        message: "Missing --space — run `mrmr space link` first",
      });
      return;
    }

    const { auth, spaceId: resolvedSpaceId } = await runScopePreflight(flags, "space:read", spaceId);
    const flowId = typeof args["flow-id"] === "string" ? args["flow-id"] : undefined;

    if (flowId) {
      const res = await hubFetch(auth, `/v1/flows/${flowId}?space_id=${encodeURIComponent(resolvedSpaceId)}`);
      const body = (await res.json()) as Record<string, unknown>;
      emitFlowResult({ ok: res.ok, ...body }, formatStatusHuman);
      return;
    }

    const res = await hubFetch(auth, `/v1/spaces/${resolvedSpaceId}/index/flows`);
    const body = (await res.json()) as Record<string, unknown>;
    emitFlowResult({ ok: res.ok, ...body }, formatStatusHuman);
  },
}) as CommandDef;

export const flowListCommand = defineCommand({
  meta: {
    name: "list",
    description: `List indexed flows on hub ${requiresLine("space:read")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:read");
    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/index/flows`);
    const body = (await res.json()) as Record<string, unknown>;
    emitFlowResult({ ok: res.ok, ...body });
  },
}) as CommandDef;

export const flowDoctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: `Deprecated alias for mrmr doctor ${requiresLine("any valid token")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    resolveHubAuthOrExit(flags);
    if (!flags.json) {
      console.error("Note: use mrmr doctor (flow doctor is deprecated)");
    }
    const result = await runDoctor({ hubUrl: flags.hubUrl, token: flags.token });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatDoctorHuman(result));
    }
    if (!result.ok) {
      process.exit(1);
    }
  },
}) as CommandDef;
