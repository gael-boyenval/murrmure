import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { colors } from "consola/utils";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { mapHubDenial } from "../../lib/hub-request.js";
import { cliConsola, isJsonMode, printErr, printOk } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { readSpaceLink } from "../../lib/space-link-file.js";

export const spaceStatusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show indexed murrmure/ counts and digests (Requires: space:read)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root (default: .) — used to resolve linked space",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const projectPath = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());
    const link = readSpaceLink(projectPath);
    const spaceId = flags.space ?? link?.space_id;
    if (!spaceId) {
      printErr("USAGE", "Missing --space — run `mrmr space link` first");
    }

    const { auth } = await runScopePreflight(flags, "space:read", spaceId);
    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/index/status`);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const denial = mapHubDenial(res.status, body);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }

    if (isJsonMode() || flags.json) {
      printOk(body);
      return;
    }

    const counts = body.counts as Record<string, number> | undefined;
    const digests = body.digests as
      | {
          flows?: Array<{
            flow_id: string;
            digest: string;
            step_contract_catalog_digest?: string;
            step_contract_step_count?: number;
          }>;
        }
      | undefined;

    const indent = "  ";
    const row = (label: string, value: string) => {
      cliConsola.log(`${indent}${colors.dim(label.padEnd(10))} ${value}`);
    };

    cliConsola.log("");
    cliConsola.info(colors.bold("Space status"));
    row("Space", `${colors.bold(spaceId)}`);

    const actionCount = counts?.actions ?? 0;
    const executorCount = counts?.executors ?? 0;
    const handlerCount = counts?.handlers ?? counts?.hooks ?? 0;
    const flowCount = counts?.flows ?? 0;
    row("Actions", actionCount > 0 ? colors.green(String(actionCount)) : colors.dim("0"));
    row("Executors", executorCount > 0 ? colors.green(String(executorCount)) : colors.dim("0"));
    row("Handlers", handlerCount > 0 ? colors.green(String(handlerCount)) : colors.dim("0"));
    row("Flows", flowCount > 0 ? colors.green(String(flowCount)) : colors.dim("0"));

    if (digests?.flows?.length) {
      cliConsola.log("");
      cliConsola.info(colors.bold("Flow digests"));
      for (const f of digests.flows) {
        const shortDigest = f.digest.replace(/^sha256:/, "").slice(0, 12);
        const catalog =
          f.step_contract_catalog_digest != null
            ? colors.dim(
                ` · catalog ${f.step_contract_catalog_digest.replace(/^sha256:/, "").slice(0, 12)}… (${f.step_contract_step_count ?? 0} steps)`,
              )
            : "";
        cliConsola.log(
          `${indent}${colors.cyan(f.flow_id)}  ${colors.dim(`${shortDigest}…`)}${catalog}`,
        );
      }
    }

    const bindings = body.bindings as Array<{ host: string; path: string }> | undefined;
    if (bindings?.length) {
      cliConsola.log("");
      cliConsola.info(colors.bold("Bindings"));
      for (const b of bindings) {
        cliConsola.log(`${indent}${colors.dim(`${b.host}:`)}${b.path}`);
      }
    }
  },
}) as CommandDef;
