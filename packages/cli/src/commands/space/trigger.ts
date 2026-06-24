import { readFileSync } from "node:fs";
import { defineCommand, type CommandDef } from "citty";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { exitUsage } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { emitHubConfigJson, printHubConfigData } from "../../lib/space-output.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

function parseJsonOrFile(value: string): unknown {
  if (value.startsWith("@")) {
    return JSON.parse(readFileSync(value.slice(1), "utf-8"));
  }
  return JSON.parse(value);
}

function parseOptionalJsonOrFile(value: string | undefined): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = parseJsonOrFile(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    exitUsage("Body must be a JSON object or @file.json");
  } catch {
    exitUsage("Could not parse body as JSON or @file");
  }
}

export const triggerListCommand = defineCommand({
  meta: {
    name: "list",
    description: `List registered triggers ${requiresLine("space:read")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:read");

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/triggers`);
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerRegisterCommand = defineCommand({
  meta: {
    name: "register",
    description: `Register a trigger ${requiresLine("trigger:register")}`,
  },
  args: {
    ...globalArgs,
    name: {
      type: "string",
      description: "Trigger display name",
    },
    filter: {
      type: "string",
      description: "Filter JSON or @file.json (custom registration)",
    },
    action: {
      type: "string",
      description: "Action JSON or @file.json (custom registration)",
    },
    template: {
      type: "string",
      description: "Template id (e.g. spec-published-wake-dev) — uses from-template route",
    },
    "source-space": {
      type: "string",
      description: "Source space id for template registration",
    },
    "target-space": {
      type: "string",
      description: "Target space id for template registration (default: --space)",
    },
    "wake-label": {
      type: "string",
      description: "Wake label override for template registration",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "trigger:register");

    const templateId = typeof args.template === "string" ? args.template : undefined;

    if (templateId) {
      const sourceSpace =
        typeof args["source-space"] === "string" ? args["source-space"] : undefined;
      if (!sourceSpace) {
        exitUsage(
          "Missing --source-space for template registration. Run `mrmr space trigger register --help`.",
        );
      }

      const body: Record<string, unknown> = {
        template_id: templateId,
        source_space_id: sourceSpace,
        target_space_id:
          typeof args["target-space"] === "string" ? args["target-space"] : spaceId,
      };
      if (typeof args.name === "string" && args.name) body.name = args.name;
      if (typeof args["wake-label"] === "string" && args["wake-label"]) {
        body.wake_label = args["wake-label"];
      }

      const res = await hubFetch(auth, `/v1/spaces/${spaceId}/triggers/from-template`, {
        method: "POST",
        json: body,
      });
      printHubConfigData(await emitHubConfigJson(res));
      return;
    }

    const filterRaw = typeof args.filter === "string" ? args.filter : undefined;
    const actionRaw = typeof args.action === "string" ? args.action : undefined;
    if (!filterRaw || !actionRaw) {
      exitUsage(
        "Missing --filter and --action. Run `mrmr space trigger register --help`.",
      );
    }

    let filter: unknown;
    let action: unknown;
    try {
      filter = parseJsonOrFile(filterRaw);
      action = parseJsonOrFile(actionRaw);
    } catch {
      exitUsage("Could not parse --filter or --action as JSON or @file");
    }

    const body: Record<string, unknown> = { filter, action };
    if (typeof args.name === "string" && args.name) body.name = args.name;

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/triggers`, {
      method: "POST",
      json: body,
    });
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerDisableCommand = defineCommand({
  meta: {
    name: "disable",
    description: `Disable a trigger ${requiresLine("trigger:register")}`,
  },
  args: {
    ...globalArgs,
    trigger_id: {
      type: "positional",
      description: "Trigger id (trg_…)",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const triggerId = typeof args.trigger_id === "string" ? args.trigger_id : undefined;
    if (!triggerId) {
      exitUsage("Missing <trigger_id>. Run `mrmr space trigger disable --help`.");
    }

    const { auth, spaceId } = await runScopePreflight(flags, "trigger:register");

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/triggers/${encodeURIComponent(triggerId)}/disable`,
      { method: "POST" },
    );
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerDeliveriesCommand = defineCommand({
  meta: {
    name: "deliveries",
    description: `List trigger delivery log ${requiresLine("space:read")}`,
  },
  args: {
    ...globalArgs,
    limit: {
      type: "string",
      description: "Max deliveries to return (default: 50)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:read");

    const limit = typeof args.limit === "string" && args.limit ? args.limit : "50";
    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/triggers/deliveries?limit=${encodeURIComponent(limit)}`,
    );
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerReplayCommand = defineCommand({
  meta: {
    name: "replay",
    description: `Replay a trigger delivery ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    trigger_id: {
      type: "positional",
      description: "Trigger id (trg_…)",
      required: true,
    },
    body: {
      type: "string",
      description: "Replay body JSON or @file.json (e.g. source_event_id)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const triggerId = typeof args.trigger_id === "string" ? args.trigger_id : undefined;
    if (!triggerId) {
      exitUsage("Missing <trigger_id>. Run `mrmr space trigger replay --help`.");
    }

    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const body =
      parseOptionalJsonOrFile(typeof args.body === "string" ? args.body : undefined) ?? {};

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/triggers/${encodeURIComponent(triggerId)}/replay`,
      { method: "POST", json: body },
    );
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerTemplatesCommand = defineCommand({
  meta: {
    name: "templates",
    description: `List bundled trigger templates ${requiresLine("space:read")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:read");

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/triggers/templates`);
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerEventCatalogCommand = defineCommand({
  meta: {
    name: "event-catalog",
    description: `List trigger event types from live flows ${requiresLine("space:read")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:read");

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/triggers/event-catalog`);
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerTestFireCommand = defineCommand({
  meta: {
    name: "test-fire",
    description: `Synthetic event → delivery (debug) ${requiresLine("trigger:register")}`,
  },
  args: {
    ...globalArgs,
    trigger_id: {
      type: "positional",
      description: "Trigger id (trg_…)",
      required: true,
    },
    body: {
      type: "string",
      description: "Synthetic event JSON or @file.json",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const triggerId = typeof args.trigger_id === "string" ? args.trigger_id : undefined;
    if (!triggerId) {
      exitUsage("Missing <trigger_id>. Run `mrmr space trigger test-fire --help`.");
    }

    const { auth, spaceId } = await runScopePreflight(flags, "trigger:register");

    const body = parseOptionalJsonOrFile(typeof args.body === "string" ? args.body : undefined);

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/triggers/${encodeURIComponent(triggerId)}/test-fire`,
      { method: "POST", json: body ?? {} },
    );
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const triggerCommand = defineCommand({
  meta: { name: "trigger", description: "Webhook trigger management" },
  subCommands: {
    list: triggerListCommand,
    register: triggerRegisterCommand,
    disable: triggerDisableCommand,
    deliveries: triggerDeliveriesCommand,
    replay: triggerReplayCommand,
    templates: triggerTemplatesCommand,
    "event-catalog": triggerEventCatalogCommand,
    "test-fire": triggerTestFireCommand,
  },
}) as CommandDef;
