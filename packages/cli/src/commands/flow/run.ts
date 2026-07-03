import { defineCommand } from "citty";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { hubJson } from "../../lib/hub-request.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { emitFlowResult } from "../../lib/flow-output.js";

export const flowRunCommand = defineCommand({
  meta: {
    name: "run",
    description: "Start a flow run (manual start) (Requires: flow:run)",
  },
  args: {
    ...globalArgs,
    flow_id: {
      type: "positional",
      description: "Indexed flow id (e.g. flw_morning_brief)",
      required: true,
    },
    input: {
      type: "string",
      description: "JSON input object for the run",
      default: "{}",
    },
    session: {
      type: "string",
      description: "Existing session id (optional)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "flow:run");

    const flowId = String(args.flow_id);
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(String(args.input ?? "{}")) as Record<string, unknown>;
    } catch {
      emitFlowResult({ ok: false, code: "INVALID_INPUT", message: "--input must be valid JSON" });
      return;
    }

    const body: Record<string, unknown> = {
      space_id: spaceId,
      input,
    };
    if (args.session) body.session_id = String(args.session);

    const result = await hubJson(auth, `/v1/flows/${encodeURIComponent(flowId)}/run`, {
      method: "POST",
      json: body,
    });

    if (!result.ok) {
      emitFlowResult({ ok: false, ...(result.body as Record<string, unknown>) });
      return;
    }

    emitFlowResult({ ok: true, ...(result.data as Record<string, unknown>) });
  },
});
