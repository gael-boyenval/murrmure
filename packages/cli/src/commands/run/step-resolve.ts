import { readFileSync } from "node:fs";
import { defineCommand, type CommandDef } from "citty";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    printErr("MISSING_ENV", `${name} is required for 'mrmr step resolve'`);
  }
  return value;
}

function parsePayloadJson(raw: string, source: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      printErr("INVALID_PAYLOAD", `${source} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch {
    printErr("INVALID_PAYLOAD", `${source} is not valid JSON`);
  }
}

function parseArtifactOut(raw: string | string[] | undefined): Array<{ slot: string; path: string }> {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const out: Array<{ slot: string; path: string }> = [];
  for (const value of values) {
    const [slot, ...pathParts] = value.split("=");
    const path = pathParts.join("=").trim();
    if (!slot?.trim() || !path) {
      printErr(
        "INVALID_ARTIFACT_OUT",
        "Use --artifact-out <slot=relative/path> (example: report=out/report.json)",
      );
    }
    out.push({ slot: slot.trim(), path });
  }
  return out;
}

async function readStdin(): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export const stepResolveCommand = defineCommand({
  meta: {
    name: "resolve",
    description: "Resolve the current run step using shell env bindings (Requires: step:resolve)",
  },
  args: {
    ...globalArgs,
    branch: {
      type: "string",
      description: "Branch to resolve (e.g. completed, failed)",
      required: true,
    },
    "payload-json": {
      type: "string",
      description: "Inline JSON object payload",
    },
    "payload-stdin": {
      type: "boolean",
      description: "Read JSON object payload from stdin",
      default: false,
    },
    "payload-file": {
      type: "string",
      description: "Read JSON object payload from file path",
    },
    "artifact-out": {
      type: "string",
      description: "Artifact mapping as slot=relative/path (repeatable)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    void flags;

    const run_id = requireEnv("MURRMURE_RUN_ID");
    const step_id = requireEnv("MURRMURE_STEP_ID");
    const hubToken = requireEnv("MURRMURE_HUB_TOKEN");
    const hubUrl = requireEnv("MURRMURE_HUB_URL").replace(/\/$/, "");

    const payloadSources = [
      typeof args["payload-json"] === "string" ? "payload-json" : null,
      args["payload-stdin"] ? "payload-stdin" : null,
      typeof args["payload-file"] === "string" ? "payload-file" : null,
    ].filter((v): v is string => Boolean(v));
    if (payloadSources.length > 1) {
      printErr(
        "USAGE",
        "Use only one payload source (--payload-json | --payload-stdin | --payload-file)",
      );
    }

    let payload: Record<string, unknown> = {};
    if (typeof args["payload-json"] === "string") {
      payload = parsePayloadJson(args["payload-json"], "--payload-json");
    } else if (args["payload-stdin"]) {
      payload = parsePayloadJson((await readStdin()).trim(), "stdin");
    } else if (typeof args["payload-file"] === "string") {
      payload = parsePayloadJson(readFileSync(args["payload-file"], "utf-8"), args["payload-file"]);
    }

    const artifacts_out = parseArtifactOut(
      args["artifact-out"] as string | string[] | undefined,
    );

    const res = await fetch(
      `${hubUrl}/v1/runs/${encodeURIComponent(run_id)}/steps/${encodeURIComponent(step_id)}/resolve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hubToken}`,
        },
        body: JSON.stringify({
          branch: String(args.branch),
          payload,
          artifacts_out: artifacts_out.length > 0 ? artifacts_out : undefined,
        }),
      },
    );

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      printErr(
        typeof body.code === "string" ? body.code : "RESOLVE_FAILED",
        typeof body.message === "string"
          ? body.message
          : `Resolve step failed (${res.status})`,
        Array.isArray(body.errors) ? { errors: body.errors } : undefined,
      );
    }

    if (isJsonMode()) {
      printOk(body);
      return;
    }
    printOk(
      body,
      `✓ Resolved step '${step_id}' on branch '${String(args.branch)}'`,
    );
  },
}) as CommandDef;
