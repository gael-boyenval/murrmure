import { readFileSync } from "node:fs";
import { defineCommand, type CommandDef } from "citty";
import type { HubAuth } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { hubFetch, mapHubDenial } from "../../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";
import {
  runGlobalScopePreflight,
  runScopePreflight,
  runTokenPreflight,
} from "../../lib/preflight.js";
import {
  formatSpaceListTable,
  formatSpaceShow,
  type SpaceSummary,
} from "../../lib/space-formatters.js";

async function emitHubJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const denial = mapHubDenial(res.status, body);
    printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
  }
  return body;
}

function parseJsonOrFile(value: string): unknown {
  if (value.startsWith("@")) {
    return JSON.parse(readFileSync(value.slice(1), "utf-8"));
  }
  return JSON.parse(value);
}

export type CreateSpaceInput = {
  slug: string;
  name: string;
  install_policy?: string;
  preview_policy?: string;
  description?: string;
  parent_space_id?: string;
};

export async function createSpaceOnHub(
  auth: HubAuth,
  input: CreateSpaceInput,
): Promise<SpaceSummary> {
  const res = await hubFetch(auth, "/v1/spaces", {
    method: "POST",
    json: {
      slug: input.slug,
      name: input.name,
      install_policy: input.install_policy ?? "human_only",
      preview_policy: input.preview_policy ?? "same_origin_only",
      ...(input.description ? { description: input.description } : {}),
      ...(input.parent_space_id ? { parent_space_id: input.parent_space_id } : {}),
    },
  });
  return (await emitHubJson(res)) as unknown as SpaceSummary;
}

export async function listSpacesOnHub(auth: HubAuth): Promise<SpaceSummary[]> {
  const res = await hubFetch(auth, "/v1/spaces");
  const body = await emitHubJson(res);
  const spaces = body.spaces;
  return Array.isArray(spaces) ? (spaces as SpaceSummary[]) : [];
}

export const spaceListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List spaces (Requires: space:enter)",
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth } = await runGlobalScopePreflight(flags, "space:enter");

    const spaces = await listSpacesOnHub(auth);

    if (isJsonMode()) {
      printOk({ spaces });
      return;
    }

    console.log(formatSpaceListTable(spaces));
  },
}) as CommandDef;

export const spaceShowCommand = defineCommand({
  meta: {
    name: "show",
    description: "Show space details (Requires: valid token for <space>)",
  },
  args: {
    ...globalArgs,
    space_id: {
      type: "positional",
      description: "Space id",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const spaceId = typeof args.space_id === "string" ? args.space_id : undefined;
    if (!spaceId) {
      printErr("USAGE", "Missing <space_id>. Run `mrmr space show --help`.");
    }

    const { auth } = await runTokenPreflight(flags, spaceId);

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}`);
    const space = (await emitHubJson(res)) as unknown as SpaceSummary;

    if (isJsonMode()) {
      printOk({ ...space });
      return;
    }

    console.log(formatSpaceShow(space));
  },
}) as CommandDef;

export const spaceCreateCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a space (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    slug: {
      type: "string",
      description: "Editable URL-safe space slug (identity is a separate opaque spc_* id)",
      required: true,
    },
    name: {
      type: "string",
      description: "Display name",
      required: true,
    },
    "install-policy": {
      type: "string",
      description: "Install policy (default: human_only)",
    },
    "preview-policy": {
      type: "string",
      description: "Preview policy (default: same_origin_only)",
    },
    description: {
      type: "string",
      description: "Optional description",
    },
    parent: {
      type: "string",
      description: "Parent space id",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth } = await runGlobalScopePreflight(flags, "space:admin");

    const slug = typeof args.slug === "string" ? args.slug : undefined;
    const name = typeof args.name === "string" ? args.name : undefined;
    if (!slug || !name) {
      printErr("USAGE", "Missing --slug and --name. Run `mrmr space create --help`.");
    }

    const space = await createSpaceOnHub(auth, {
      slug,
      name,
      install_policy:
        typeof args["install-policy"] === "string" ? args["install-policy"] : undefined,
      preview_policy:
        typeof args["preview-policy"] === "string" ? args["preview-policy"] : undefined,
      description: typeof args.description === "string" ? args.description : undefined,
      parent_space_id: typeof args.parent === "string" ? args.parent : undefined,
    });

    if (isJsonMode()) {
      printOk({ ...space });
      return;
    }

    printOk({}, space.space_id);
  },
}) as CommandDef;

export const spaceUpdateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Update a space (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    space_id: {
      type: "positional",
      description: "Space id",
      required: true,
    },
    name: {
      type: "string",
      description: "Display name",
    },
    "install-policy": {
      type: "string",
      description: "Install policy",
    },
    "preview-policy": {
      type: "string",
      description: "Preview policy",
    },
    "query-policy": {
      type: "string",
      description: 'Query policy JSON or @file.json (e.g. \'{"inbound_allowlist":["spc_…"]}\')',
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const spaceId = typeof args.space_id === "string" ? args.space_id : undefined;
    if (!spaceId) {
      printErr("USAGE", "Missing <space_id>. Run `mrmr space update --help`.");
    }

    const { auth } = await runScopePreflight(flags, "space:admin", spaceId);

    const patch: Record<string, unknown> = {};
    if (typeof args.name === "string") patch.name = args.name;
    if (typeof args["install-policy"] === "string") {
      patch.install_policy = args["install-policy"];
    }
    if (typeof args["preview-policy"] === "string") {
      patch.preview_policy = args["preview-policy"];
    }
    if (typeof args["query-policy"] === "string") {
      try {
        patch.query_policy = parseJsonOrFile(args["query-policy"]);
      } catch {
        printErr("INVALID_JSON", "Could not parse --query-policy as JSON or @file");
      }
    }

    if (Object.keys(patch).length === 0) {
      printErr("USAGE", "Provide at least one field to update");
    }

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}`, {
      method: "PATCH",
      json: patch,
    });
    const space = (await emitHubJson(res)) as unknown as SpaceSummary;

    if (isJsonMode()) {
      printOk({ ...space });
      return;
    }

    printOk({}, `✓ Updated ${space.space_id}`);
  },
}) as CommandDef;

export const spaceArchiveCommand = defineCommand({
  meta: {
    name: "archive",
    description: "Archive a space (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    space_id: {
      type: "positional",
      description: "Space id",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const spaceId = typeof args.space_id === "string" ? args.space_id : undefined;
    if (!spaceId) {
      printErr("USAGE", "Missing <space_id>. Run `mrmr space archive --help`.");
    }

    const { auth } = await runScopePreflight(flags, "space:admin", spaceId);

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/archive`, { method: "POST" });
    const body = await emitHubJson(res);

    if (isJsonMode()) {
      printOk(body);
      return;
    }

    printOk({}, `✓ Archived ${spaceId}`);
  },
}) as CommandDef;
