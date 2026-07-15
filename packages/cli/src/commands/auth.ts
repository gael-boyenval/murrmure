import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { DEFAULT_HUB_URL, type HubAuth, resolveHubAuth } from "../auth.js";
import {
  clearAuthContextCache,
  fetchWhoami,
  type WhoamiResponse,
} from "../lib/auth-context.js";
import {
  credentialsPath,
  deleteCredentials,
  readCredentials,
  writeCredentials,
} from "../lib/auth-store.js";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { mapWhoamiAuthError } from "../lib/hub-request.js";
import { exitUsage, printErr, printOk } from "../lib/output.js";
import { formatWhoamiTable } from "../lib/whoami-format.js";

const execFileAsync = promisify(execFile);

function normalizeHubUrl(url: string): string {
  return url.replace(/\/$/, "");
}

async function openSpacesNewPage(hubUrl: string): Promise<void> {
  const url = `${normalizeHubUrl(hubUrl)}/spaces/new`;
  const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    await execFileAsync(openCmd, [url]);
    p.log.info(`Opened ${url} — complete operator login before creating a local connection`);
  } catch {
    p.log.warn(
      `Could not open browser — visit ${url} after completing operator login`,
    );
  }
}

export async function validateAndSaveLogin(
  hubUrl: string,
  token: string,
): Promise<{ ok: true; whoami: WhoamiResponse } | { ok: false; code: string; message: string }> {
  const auth: HubAuth = {
    hubUrl: normalizeHubUrl(hubUrl),
    token: token.trim(),
  };

  const whoami = await fetchWhoami(auth);
  if ("error" in whoami) {
    const mapped = mapWhoamiAuthError(whoami.status, whoami.body);
    return {
      ok: false,
      code: mapped.code,
      message: mapped.message,
    };
  }

  const defaultSpaceId =
    whoami.spaces.length === 1 ? whoami.spaces[0].space_id : readCredentials()?.defaultSpaceId;

  writeCredentials({
    version: 1,
    hubUrl: auth.hubUrl,
    token: auth.token,
    defaultSpaceId,
    savedAt: new Date().toISOString(),
  });
  clearAuthContextCache();

  return { ok: true, whoami };
}

export const loginCommand = defineCommand({
  meta: {
    name: "login",
    description: "Save hub URL and bearer token locally (Requires: none)",
  },
  args: {
    ...globalArgs,
    open: {
      type: "boolean",
      description: "Open browser to /spaces/new (operator login and space bootstrap)",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);

    if (!flags.json) {
      p.intro("Murrmure login");
    }

    let hubUrl = flags.hubUrl ?? DEFAULT_HUB_URL;
    let token: string;

    if (flags.json) {
      hubUrl = normalizeHubUrl(hubUrl);
      if (!flags.token?.trim()) {
        exitUsage("login --json requires --token");
      }
      token = flags.token.trim();
    } else {
      if (!flags.hubUrl) {
        const answer = await p.text({
          message: "Hub URL",
          placeholder: DEFAULT_HUB_URL,
          defaultValue: DEFAULT_HUB_URL,
        });
        if (p.isCancel(answer)) {
          p.cancel("Login cancelled");
          process.exit(1);
        }
        hubUrl = normalizeHubUrl(String(answer).trim() || DEFAULT_HUB_URL);
      } else {
        hubUrl = normalizeHubUrl(hubUrl);
      }

      if (args.open) {
        await openSpacesNewPage(hubUrl);
      }

      const tokenAnswer = await p.password({
        message: "Bearer token (tok_…)",
        validate(value) {
          if (!value?.trim()) return "Token is required";
        },
      });
      if (p.isCancel(tokenAnswer)) {
        p.cancel("Login cancelled");
        process.exit(1);
      }
      token = String(tokenAnswer);
    }

    const result = await validateAndSaveLogin(hubUrl, token);
    if (!result.ok) {
      printErr(result.code, result.message);
    }

    const { whoami } = result;
    const spaceLabel = whoami.spaces.length === 1 ? "space" : "spaces";
    const humanLine = `✓ Logged in as ${whoami.actor_id} (${whoami.spaces.length} ${spaceLabel})`;

    if (flags.json) {
      printOk({
        actor_id: whoami.actor_id,
        token_id: whoami.token_id,
        kind: whoami.kind,
        spaces: whoami.spaces,
        expires_at: whoami.expires_at,
      });
    } else {
      p.outro(humanLine);
    }
  },
}) as CommandDef;

export const logoutCommand = defineCommand({
  meta: {
    name: "logout",
    description: "Remove saved credentials (Requires: none)",
  },
  args: {
    ...globalArgs,
    yes: {
      type: "boolean",
      alias: ["y"],
      description: "Skip confirmation",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const existing = readCredentials();

    if (!existing) {
      printOk({}, flags.json ? undefined : "No saved credentials");
      return;
    }

    if (!args.yes) {
      const confirmed = await p.confirm({
        message: `Remove credentials at ${credentialsPath()}?`,
        initialValue: false,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        if (!flags.json) {
          console.log("Logout cancelled");
        }
        return;
      }
    }

    deleteCredentials();
    clearAuthContextCache();

    printOk({}, flags.json ? undefined : "✓ Logged out (env vars unchanged)");
  },
}) as CommandDef;

export const whoamiCommand = defineCommand({
  meta: {
    name: "whoami",
    description: "Show actor, token, and space scopes (Requires: any valid token)",
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const auth = resolveHubAuth({ hubUrl: flags.hubUrl, token: flags.token });
    if ("error" in auth) {
      printErr("AUTH_MISSING", auth.error);
    }

    const whoami = await fetchWhoami(auth);
    if ("error" in whoami) {
      const mapped = mapWhoamiAuthError(whoami.status, whoami.body);
      printErr(mapped.code, mapped.message, mapped.hint);
    }

    if (flags.json) {
      console.log(JSON.stringify(whoami, null, 2));
      return;
    }

    console.log(formatWhoamiTable(whoami));
  },
}) as CommandDef;
