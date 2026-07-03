import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { DEFAULT_HUB_URL } from "../../auth.js";
import { validateAndSaveLogin } from "../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { printErr } from "../../lib/output.js";
import { runGlobalScopePreflight } from "../../lib/preflight.js";
import { createSpaceOnHub } from "./commands.js";
import { confirmStep, promptPassword, promptText } from "../../wizard/interactive.js";
import { wizardMintAgentGrant } from "../../wizard/grant.js";
import {
  WizardHubError,
  wizardSpaceApply,
  wizardSpaceInit,
  wizardSpaceLink,
} from "../../wizard/space-ops.js";

const DEFAULT_SPACES = [
  { slug: "ui-sandbox", name: "UI Sandbox" },
  { slug: "ui-production", name: "UI Production" },
] as const;

export const spaceSetupCommand = defineCommand({
  meta: {
    name: "setup",
    description: "Interactive hub setup wizard — init, link, apply (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root for murrmure/ scaffold (default: .)",
    },
    yes: {
      type: "boolean",
      description: "Non-interactive — accept defaults",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const yes = Boolean(args.yes);
    const projectPath = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());

    if (flags.json) {
      printErr("USAGE", "Use `mrmr setup --json` for machine-readable output");
    }

    p.intro("Murrmure space setup");

    if (await confirmStep("Step 1 — Connect hub URL and token?", { yes })) {
      if (!yes) {
        const hubAnswer = await promptText("Hub URL", {
          placeholder: DEFAULT_HUB_URL,
          defaultValue: DEFAULT_HUB_URL,
        });
        const tokenAnswer = await promptPassword("Bearer token (tok_…)", (value) => {
          if (!value?.trim()) return "Token is required";
        });

        const login = await validateAndSaveLogin(hubAnswer, tokenAnswer);
        if (!login.ok) {
          printErr(login.code, login.message);
        }
        p.log.success(`Connected as ${login.whoami.actor_id}`);
      } else {
        p.log.info("Using saved credentials or env");
      }
    } else {
      p.log.info("Skipped connect — using saved credentials or env");
    }

    const { auth } = await runGlobalScopePreflight(flags, "space:admin");
    const createdSpaceIds: string[] = [];

    if (await confirmStep("Step 2 — Create default spaces (ui-sandbox, ui-production)?", { yes })) {
      for (const defaults of DEFAULT_SPACES) {
        if (!yes) {
          const useDefaults = await p.confirm({
            message: `Create ${defaults.slug} (${defaults.name})?`,
            initialValue: true,
          });
          if (p.isCancel(useDefaults)) {
            p.cancel("Setup cancelled — partial progress saved");
            process.exit(0);
          }
          if (!useDefaults) continue;
        }

        const space = await createSpaceOnHub(auth, {
          slug: defaults.slug,
          name: defaults.name,
        });
        createdSpaceIds.push(space.space_id);
        p.log.success(`Created ${space.space_id}`);
      }
    }

    const sandboxId = createdSpaceIds[0];
    let linkedSpaceId: string | undefined;

    if (await confirmStep("Step 3 — Scaffold murrmure/, link, and apply?", { yes })) {
      try {
        if (!existsSync(resolve(projectPath, "murrmure"))) {
          const initResult = await wizardSpaceInit(projectPath, { withSkill: false });
          p.log.success(`Scaffolded murrmure/ (${initResult.created.length} files)`);
        }

        const linkResult = await wizardSpaceLink(flags, projectPath, {
          spaceId: sandboxId ?? flags.space,
          create: !sandboxId && !flags.space,
        });
        linkedSpaceId = linkResult.space_id;
        p.log.success(`Linked ${projectPath} → ${linkResult.space_id}`);

        await wizardSpaceApply(flags, projectPath, linkResult.space_id);
        p.log.success("Applied murrmure/ index to hub");
      } catch (error) {
        const message = error instanceof Error ? error.message : "init/link/apply failed";
        const code = error instanceof WizardHubError ? error.code : "WIZARD_STEP_FAILED";
        printErr(code, message);
      }
    }

    if (await confirmStep("Step 4 — Mint a worker grant for agent access?", { yes })) {
      const spaceId = linkedSpaceId ?? flags.space;
      if (!spaceId) {
        p.log.warn("No space id — skip grant or run `mrmr grant mint` after link");
      } else {
        try {
          const grant = await wizardMintAgentGrant(auth, spaceId, { label: "Worker agent" });
          if (grant.token) {
            p.note(
              `Save this token now — it will not be shown again:\n\n  ${grant.token}`,
              "One-time grant token",
            );
          }
          p.note(grant.mcp_snippet, "Paste into .cursor/mcp.json");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Grant mint failed";
          p.log.warn(`Grant mint failed: ${message}`);
        }
      }
    }

    p.outro("Setup complete — run `mrmr doctor` to verify, then open Desktop and Run");
  },
}) as CommandDef;
