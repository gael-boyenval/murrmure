import { defineCommand, type CommandDef } from "citty";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { exitUsage } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { emitHubConfigJson, printHubConfigData } from "../../lib/space-output.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

const MEMBER_ROLES = new Set(["admin", "editor", "viewer"]);

function assertRole(role: string | undefined, flagName: string): string {
  if (!role || !MEMBER_ROLES.has(role)) {
    exitUsage(`${flagName} must be one of: admin, editor, viewer`);
  }
  return role;
}

export const memberListCommand = defineCommand({
  meta: {
    name: "list",
    description: `List space members ${requiresLine("space:admin")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/members`);
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const memberInviteCommand = defineCommand({
  meta: {
    name: "invite",
    description: `Invite a member by email ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    email: {
      type: "string",
      description: "Member email address",
      required: true,
    },
    role: {
      type: "string",
      description: "Member role: admin, editor, or viewer",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    if (!args.email) {
      exitUsage("Missing --email. Run `mrmr space member invite --help`.");
    }
    const role = assertRole(typeof args.role === "string" ? args.role : undefined, "--role");

    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/members`, {
      method: "POST",
      json: { email: String(args.email), role },
    });
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const memberRoleCommand = defineCommand({
  meta: {
    name: "role",
    description: `Change a member role ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    member_id: {
      type: "positional",
      description: "Member id",
      required: true,
    },
    role: {
      type: "string",
      description: "New role: admin, editor, or viewer",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const memberId = typeof args.member_id === "string" ? args.member_id : undefined;
    if (!memberId) {
      exitUsage("Missing <member_id>. Run `mrmr space member role --help`.");
    }
    const role = assertRole(typeof args.role === "string" ? args.role : undefined, "--role");

    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/members/${encodeURIComponent(memberId)}`,
      {
        method: "PATCH",
        json: { role },
      },
    );
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const memberRemoveCommand = defineCommand({
  meta: {
    name: "remove",
    description: `Remove a space member ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    member_id: {
      type: "positional",
      description: "Member id",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const memberId = typeof args.member_id === "string" ? args.member_id : undefined;
    if (!memberId) {
      exitUsage("Missing <member_id>. Run `mrmr space member remove --help`.");
    }

    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE" },
    );
    if (res.status === 204 || res.status === 200) {
      printHubConfigData({ ok: true });
      return;
    }
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const memberCommand = defineCommand({
  meta: { name: "member", description: "Space member management" },
  subCommands: {
    list: memberListCommand,
    invite: memberInviteCommand,
    role: memberRoleCommand,
    remove: memberRemoveCommand,
  },
}) as CommandDef;
