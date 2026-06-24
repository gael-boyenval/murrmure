import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineCommand, type CommandDef } from "citty";
import { buildFlowRoot } from "../../build.js";
import { devFlowLoop } from "../../dev.js";
import { initFlow, listExamples } from "../../init.js";
import { evolutionCommand, pushFlow, readPushState } from "../../push.js";
import { formatDoctorHuman, runDoctor } from "../../lib/doctor.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import {
  formatBuildHuman,
  formatInitHuman,
  formatPushHuman,
  formatStatusHuman,
  formatValidateHuman,
} from "../../lib/flow-formatters.js";
import { emitFlowResult } from "../../lib/flow-output.js";
import { hubFetch } from "../../lib/hub-request.js";
import { printErr } from "../../lib/output.js";
import { resolveHubAuthOrExit, runScopePreflight } from "../../lib/preflight.js";
import { validateFlowRoot } from "../../validate.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

function flowPathArg(args: Record<string, unknown>, rawArgs: string[]): string {
  if (typeof args.path === "string") return resolve(args.path);
  if (rawArgs[0]) return resolve(rawArgs[0]);
  return resolve(".");
}

const pathPositional = {
  path: {
    type: "positional",
    description: "Flow package directory",
    required: false,
  },
} as const;

export const flowInitCommand = defineCommand({
  meta: {
    name: "init",
    description: `Scaffold a new flow package ${requiresLine("none")}`,
  },
  args: {
    ...globalArgs,
    id: {
      type: "positional",
      description: "Flow package id (lowercase, hyphens)",
      required: true,
    },
    dir: {
      type: "string",
      description: "Output directory (default: ./workflows/<id>)",
    },
    "from-example": {
      type: "string",
      description: "Copy from bundled example template",
    },
    install: {
      type: "boolean",
      description: "Run npm install after scaffold",
      default: false,
    },
    "with-skill": {
      type: "boolean",
      description: "Install murrmure-flow Cursor skill in cwd",
      default: false,
    },
  },
  async run({ args }) {
    parseGlobalFlags(args);
    const id = typeof args.id === "string" ? args.id : undefined;
    if (!id) {
      emitFlowResult({
        ok: false,
        code: "MISSING_ARG",
        message: "Missing <id>. Run `mrmr flow init --help`.",
        examples: listExamples(),
      });
      return;
    }

    const dir = resolve(typeof args.dir === "string" ? args.dir : `./workflows/${id}`);
    const fromExample =
      typeof args["from-example"] === "string" ? args["from-example"] : undefined;

    try {
      const result = initFlow(id, dir, {
        install: Boolean(args.install),
        packageManager: "npm",
        fromExample,
        withSkill: Boolean(args["with-skill"]),
      });
      emitFlowResult(result, formatInitHuman);
    } catch (error) {
      emitFlowResult(
        {
          ok: false,
          code: "INIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
          examples: listExamples(),
        },
        (data) => formatInitHuman(data),
      );
    }
  },
}) as CommandDef;

export const flowValidateCommand = defineCommand({
  meta: {
    name: "validate",
    description: `Validate flow manifest and bundle ${requiresLine("none locally; flow:install with --space --install")}`,
  },
  args: {
    ...globalArgs,
    ...pathPositional,
    install: {
      type: "string",
      description: "Hub install id for evolution validate",
      alias: ["i"],
    },
  },
  async run({ args, rawArgs }) {
    const flags = parseGlobalFlags(args);
    const pathArg = flowPathArg(args, rawArgs);

    if (flags.space && args.install) {
      const { spaceId } = await runScopePreflight(flags, "flow:install");
      const result = await evolutionCommand("validate", {
        spaceId,
        installId: String(args.install),
      });
      emitFlowResult(result);
      return;
    }

    const result = validateFlowRoot(pathArg);
    emitFlowResult(
      { ok: result.ok, errors: result.errors, warnings: result.warnings, manifest: result.manifest },
      formatValidateHuman,
    );
  },
}) as CommandDef;

export const flowBuildCommand = defineCommand({
  meta: {
    name: "build",
    description: `Build flow bundle ${requiresLine("none")}`,
  },
  args: {
    ...globalArgs,
    ...pathPositional,
  },
  async run({ args, rawArgs }) {
    parseGlobalFlags(args);
    const pathArg = flowPathArg(args, rawArgs);
    const result = await buildFlowRoot(pathArg);
    emitFlowResult(result as unknown as Record<string, unknown>, formatBuildHuman);
  },
}) as CommandDef;

export const flowPushCommand = defineCommand({
  meta: {
    name: "push",
    description: `Push flow bundle to hub ${requiresLine("flow:install")}`,
  },
  args: {
    ...globalArgs,
    ...pathPositional,
  },
  async run({ args, rawArgs }) {
    const flags = parseGlobalFlags(args);
    const { spaceId } = await runScopePreflight(flags, "flow:install");
    const pathArg = flowPathArg(args, rawArgs);
    const result = await pushFlow({ spaceId, path: pathArg });
    emitFlowResult(result, formatPushHuman);
  },
}) as CommandDef;

export const flowStatusCommand = defineCommand({
  meta: {
    name: "status",
    description: `Show local push state ${requiresLine("none")}`,
  },
  args: {
    ...globalArgs,
    ...pathPositional,
  },
  run({ args, rawArgs }) {
    parseGlobalFlags(args);
    const pathArg = flowPathArg(args, rawArgs);
    const manifest = JSON.parse(
      readFileSync(resolve(pathArg, "flow.manifest.json"), "utf-8"),
    ) as { id: string; version: string };
    const state = readPushState(manifest.id, manifest.version);
    emitFlowResult({ ok: Boolean(state), push_state: state }, formatStatusHuman);
  },
}) as CommandDef;

export const flowListCommand = defineCommand({
  meta: {
    name: "list",
    description: `List installed flows on hub ${requiresLine("space:read")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:read");
    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/flows`);
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

function evolutionLeaf(
  name: "test" | "promote" | "apply" | "rollback",
  description: string,
): CommandDef {
  return defineCommand({
    meta: {
      name,
      description: `${description} ${requiresLine("flow:install")}`,
    },
    args: {
      ...globalArgs,
      install: {
        type: "string",
        description: "Install id",
        alias: ["i"],
        required: true,
      },
    },
    async run({ args }) {
      const flags = parseGlobalFlags(args);
      if (!args.install) {
        printErr("MISSING_FLAG", "--install required");
      }
      const { spaceId } = await runScopePreflight(flags, "flow:install");
      const result = await evolutionCommand(name, {
        spaceId,
        installId: String(args.install),
      });
      emitFlowResult(result);
    },
  }) as CommandDef;
}

export const flowTestCommand = evolutionLeaf("test", "Run evolution test stage");
export const flowPromoteCommand = evolutionLeaf("promote", "Promote install to next stage");
export const flowApplyCommand = evolutionLeaf("apply", "Apply install to live");
export const flowRollbackCommand = evolutionLeaf("rollback", "Rollback install");

export const flowDevCommand = defineCommand({
  meta: {
    name: "dev",
    description: `Local dev watch loop ${requiresLine("none with --sim; flow:install with --space")}`,
  },
  args: {
    ...globalArgs,
    ...pathPositional,
    sim: {
      type: "boolean",
      description: "Run offline simulator (no hub)",
      default: false,
    },
    port: {
      type: "string",
      description: "Simulator port (default: 4310)",
    },
    fixture: {
      type: "string",
      description: "Simulator fixture name",
    },
    "auto-apply": {
      type: "boolean",
      description: "Auto-apply after push in hub mode",
      default: false,
    },
  },
  async run({ args, rawArgs }) {
    const flags = parseGlobalFlags(args);
    const simMode = Boolean(args.sim);

    let spaceId = flags.space;
    if (!simMode) {
      ({ spaceId } = await runScopePreflight(flags, "flow:install"));
    }

    const pathArg = flowPathArg(args, rawArgs);
    const port =
      typeof args.port === "string" && Number.isFinite(Number(args.port))
        ? Number(args.port)
        : undefined;

    const loop = await devFlowLoop({
      spaceId,
      path: pathArg,
      autoApply: Boolean(args["auto-apply"]),
      sim: simMode,
      simPort: port,
      simFixture: typeof args.fixture === "string" ? args.fixture : undefined,
    });

    if (!flags.json && loop.simUrl) {
      console.log(`Simulator ready at ${loop.simUrl}`);
    }

    process.on("SIGINT", () => {
      loop.stop();
      process.exit(0);
    });
  },
}) as CommandDef;
