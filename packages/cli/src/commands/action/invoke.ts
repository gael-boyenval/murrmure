import { defineCommand, type CommandDef } from "citty";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { mapHubDenial } from "../../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { readSpaceLink } from "../../lib/space-link-file.js";

export const actionInvokeCommand = defineCommand({
  meta: {
    name: "invoke",
    description: "Invoke a space-indexed action (Requires: action:invoke)",
  },
  args: {
    ...globalArgs,
    name: {
      type: "positional",
      description: "Action name",
      required: true,
    },
    params: {
      type: "string",
      description: "JSON params object",
      default: "{}",
    },
    "run-id": {
      type: "string",
      description: "Optional run id",
    },
    "session-id": {
      type: "string",
      description: "Optional session id",
    },
    "step-id": {
      type: "string",
      description: "Optional step id (default action:{name})",
    },
    delivery: {
      type: "string",
      description: "fail_fast | queue_until_executor",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const link = readSpaceLink(process.cwd());
    const spaceId = flags.space ?? link?.space_id;
    const actionName = String(args.name ?? "");
    if (!spaceId) {
      printErr("USAGE", "Missing --space — run `mrmr space link` first");
    }
    if (!actionName) {
      printErr("USAGE", "Action name is required");
    }

    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(String(args.params ?? "{}")) as Record<string, unknown>;
    } catch {
      printErr("INVALID_PARAMS", "--params must be valid JSON");
    }

    const { auth } = await runScopePreflight(flags, "action:invoke", spaceId);
    const body: Record<string, unknown> = { params };
    if (args["run-id"]) body.run_id = args["run-id"];
    if (args["session-id"]) body.session_id = args["session-id"];
    if (args["step-id"]) body.step_id = args["step-id"];
    if (args.delivery) body.delivery = args.delivery;

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/actions/${encodeURIComponent(actionName)}/invoke`, {
      method: "POST",
      json: body,
    });
    const responseBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const denial = mapHubDenial(res.status, responseBody);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }

    if (isJsonMode() || flags.json) {
      printOk(responseBody);
      return;
    }

    const dispatch = responseBody.dispatch as { status?: string; error_code?: string; detail?: string } | undefined;
    const status = dispatch?.status ?? "unknown";
    if (status === "completed") {
      printOk(responseBody, `✓ Action '${actionName}' completed`);
      return;
    }
    if (status === "dispatched") {
      printOk(responseBody, `→ Action '${actionName}' dispatched (await journal completion)`);
      return;
    }
    printOk(
      responseBody,
      `Action '${actionName}' → ${status}${dispatch?.error_code ? ` (${dispatch.error_code})` : ""}`,
    );
  },
}) as CommandDef;
