import { defineCommand, type CommandDef } from "citty";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { hubFetch, mapHubDenial } from "../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../lib/output.js";
import { runTokenPreflight } from "../lib/preflight.js";

function runtimeDescription(action: string, typicalScopes?: string): string {
  const requires = "(Requires: valid token for <space>)";
  const advisory = typicalScopes ? ` Typical scopes: ${typicalScopes}.` : "";
  return `${action} ${requires}.${advisory}`;
}

async function emitHubJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const denial = mapHubDenial(res.status, body);
    printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
  }
  return body;
}

function printHubData(body: Record<string, unknown>): void {
  if (isJsonMode()) {
    printOk(body);
    return;
  }
  console.log(JSON.stringify(body, null, 2));
}

export const runtimeEventsCommand = defineCommand({
  meta: {
    name: "events",
    description: runtimeDescription("Tail journal events", "event:read"),
  },
  args: {
    ...globalArgs,
    from_seq: {
      type: "positional",
      description: "Start sequence (default: 0)",
      required: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runTokenPreflight(flags);
    const fromSeq =
      typeof args.from_seq === "string" && args.from_seq.length > 0 ? args.from_seq : "0";

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/events?from_seq=${encodeURIComponent(fromSeq)}`,
    );
    printHubData(await emitHubJson(res));
  },
}) as CommandDef;

export const runtimeGatesCommand = defineCommand({
  meta: {
    name: "gates",
    description: runtimeDescription("List pending human gates", "space:read"),
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runTokenPreflight(flags);

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/gates`);
    printHubData(await emitHubJson(res));
  },
}) as CommandDef;

export const runtimeTransitionCommand = defineCommand({
  meta: {
    name: "transition",
    description: runtimeDescription("Apply a workflow transition", "state:transition"),
  },
  args: {
    ...globalArgs,
    instance_id: {
      type: "positional",
      description: "Instance id",
      required: true,
    },
    event: {
      type: "positional",
      description: "Transition event name",
      required: true,
    },
    expected_revision: {
      type: "positional",
      description: "Expected instance revision",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runTokenPreflight(flags);

    const instanceId = typeof args.instance_id === "string" ? args.instance_id : undefined;
    const event = typeof args.event === "string" ? args.event : undefined;
    const revision = typeof args.expected_revision === "string" ? args.expected_revision : undefined;

    if (!instanceId || !event || !revision) {
      printErr(
        "USAGE",
        "Missing arguments: <instance_id> <event> <expected_revision>. Run `mrmr runtime transition --help`.",
      );
    }

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/instances/${instanceId}/transitions`,
      {
        method: "POST",
        json: { event, expected_revision: Number(revision) },
      },
    );
    printHubData(await emitHubJson(res));
  },
}) as CommandDef;

export const runtimeWaitCommand = defineCommand({
  meta: {
    name: "wait",
    description: runtimeDescription("Poll until a wait resolves", "state:transition"),
  },
  args: {
    ...globalArgs,
    wait_id: {
      type: "positional",
      description: "Wait id",
      required: true,
    },
    timeout: {
      type: "string",
      description: "Timeout in milliseconds (default: 60000)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runTokenPreflight(flags);

    const waitId = typeof args.wait_id === "string" ? args.wait_id : undefined;
    if (!waitId) {
      printErr("USAGE", "Missing <wait_id>. Run `mrmr runtime wait --help`.");
    }

    const timeoutMs =
      typeof args.timeout === "string" && Number.isFinite(Number(args.timeout))
        ? Number(args.timeout)
        : 60_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const res = await hubFetch(auth, `/v1/spaces/${spaceId}/waits/${waitId}`);
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      if (!res.ok) {
        const denial = mapHubDenial(res.status, body);
        printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
      }
      if (body.status !== "pending") {
        printHubData(body as Record<string, unknown>);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    printHubData({ status: "timed_out", wait_id: waitId });
  },
}) as CommandDef;

export const runtimeAuditExportCommand = defineCommand({
  meta: {
    name: "export",
    description: runtimeDescription("Export audit log as JSONL", "space:read"),
  },
  args: {
    ...globalArgs,
    since: {
      type: "positional",
      description: "Export since sequence (default: 0)",
      required: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runTokenPreflight(flags);
    const since = typeof args.since === "string" && args.since.length > 0 ? args.since : "0";

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/audit/export?since=${encodeURIComponent(since)}`,
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const denial = mapHubDenial(res.status, body);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }

    const text = await res.text();
    process.stdout.write(text);
    if (!text.endsWith("\n") && text.length > 0) {
      process.stdout.write("\n");
    }
  },
}) as CommandDef;

export const runtimeAuditCommand = defineCommand({
  meta: { name: "audit", description: "Audit log operations" },
  subCommands: {
    export: runtimeAuditExportCommand,
  },
});

export const runtimeCommand = defineCommand({
  meta: { name: "runtime", description: "Hub runtime product routes" },
  subCommands: {
    events: runtimeEventsCommand,
    gates: runtimeGatesCommand,
    transition: runtimeTransitionCommand,
    wait: runtimeWaitCommand,
    audit: runtimeAuditCommand,
  },
});
