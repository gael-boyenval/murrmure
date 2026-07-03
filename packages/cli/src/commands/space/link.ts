import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { mapHubDenial } from "../../lib/hub-request.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";
import { runGlobalScopePreflight, runScopePreflight } from "../../lib/preflight.js";
import { defaultLinkHost, writeSpaceLink } from "../../lib/space-link-file.js";
import { readSpaceSlug, resolveMurrmureRoot } from "../../lib/space-directory.js";
import { discoverMurrmureProject } from "../../lib/space-doctor.js";
import { createSpaceOnHub } from "./commands.js";

export const spaceLinkCommand = defineCommand({
  meta: {
    name: "link",
    description:
      "Register local murrmure/ path binding with hub (Requires: space:write; --create also requires space:admin bootstrap token)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root containing murrmure/ (default: .)",
    },
    host: {
      type: "string",
      description: "Host identifier for binding (default: machine hostname)",
    },
    remote: {
      type: "boolean",
      description: "Link as virtual remote_hub space (no local path)",
      default: false,
    },
    peer: {
      type: "string",
      description: "Peer hub id when --remote (e.g. hub_b)",
    },
    space: {
      type: "string",
      description: "Remote space id when --remote",
    },
    create: {
      type: "boolean",
      description: "Create hub space from murrmure/space.yaml slug when --space omitted",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const cwd = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());
    const discovered = discoverMurrmureProject(cwd);
    const projectPath = discovered.projectPath;

    if (!discovered.murrmurePresent) {
      const hint =
        discovered.cwd !== projectPath
          ? `murrmure/ not found under ${discovered.cwd} — try: cd ${projectPath} && mrmr space init`
          : "First time: mrmr space init && mrmr space link --path . --create";
      printErr("NO_MURRMURE_DIR", `No murrmure/ directory in ${projectPath}`, { tip: hint });
    }

    if (discovered.cwd !== projectPath) {
      console.warn(
        `Using project root ${projectPath} (murrmure/ found above cwd ${discovered.cwd})`,
      );
    }

    try {
      resolveMurrmureRoot(projectPath);
    } catch (error) {
      printErr("NO_MURRMURE_DIR", error instanceof Error ? error.message : "murrmure/ not found");
    }

    let spaceId = flags.space;
    let auth;

    if (!spaceId && args.create) {
      const preflight = await runGlobalScopePreflight(flags, "space:admin");
      auth = preflight.auth;
      const slug = readSpaceSlug(projectPath) ?? "my-space";
      const created = await createSpaceOnHub(auth, {
        slug,
        name: slug,
      });
      spaceId = created.space_id;
      const linkPreflight = await runScopePreflight(flags, "space:write", spaceId);
      auth = linkPreflight.auth;
      spaceId = linkPreflight.spaceId;
    } else {
      if (!spaceId) {
        printErr(
          "USAGE",
          "Missing --space — pass an existing space id, or use --create to mint one from murrmure/space.yaml",
          { tip: "First time: mrmr space link --path . --create" },
        );
      }
      const preflight = await runScopePreflight(flags, "space:write", spaceId);
      auth = preflight.auth;
      spaceId = preflight.spaceId;
    }

    const host = typeof args.host === "string" && args.host ? args.host : defaultLinkHost();

    if (args.remote) {
      const peer = typeof args.peer === "string" ? args.peer : "";
      const remoteSpace = typeof args.space === "string" && args.space ? args.space : "";
      if (!peer || !remoteSpace) {
        printErr("USAGE", "--remote requires --peer and --space (remote space id on peer hub)");
      }

      const res = await hubFetch(auth, `/v1/spaces/${spaceId}/link/remote`, {
        method: "POST",
        json: { peer_hub_id: peer, remote_space_id: remoteSpace },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const denial = mapHubDenial(res.status, body);
        printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
      }

      if (isJsonMode() || flags.json) {
        printOk(body);
        return;
      }
      printOk(body, `✓ Linked virtual space ${spaceId} → peer ${peer} / ${remoteSpace}`);
      return;
    }

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/link`, {
      method: "POST",
      json: { host, path: projectPath, primary: true },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const denial = mapHubDenial(res.status, body);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }

    writeSpaceLink(projectPath, { space_id: spaceId, path: projectPath, host });

    if (isJsonMode() || flags.json) {
      printOk(body);
      return;
    }
    printOk({}, `✓ Linked ${projectPath} → ${spaceId}`);
  },
}) as CommandDef;
