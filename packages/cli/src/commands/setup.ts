import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { DEFAULT_HUB_URL } from "../auth.js";
import { validateAndSaveLogin } from "./auth.js";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { printErr, printOk } from "../lib/output.js";
import { runGlobalScopePreflight } from "../lib/preflight.js";
import { createSpaceOnHub } from "./space/commands.js";
import { readSpaceApplyBundle } from "../lib/space-directory.js";
import { installMurrmureSkill } from "../skill/install.js";
import { confirmStep, promptPassword, promptText } from "../wizard/interactive.js";
import { wizardMintAgentGrant } from "../wizard/grant.js";
import { buildSetupJsonPlan, type WizardRunResult, type WizardStepResult } from "../wizard/json.js";
import { printDesktopHandoff } from "../wizard/outro.js";
import {
  WizardHubError,
  wizardSpaceApply,
  wizardSpaceInit,
  wizardSpaceLink,
  wizardSpaceStatus,
} from "../wizard/space-ops.js";

const DEFAULT_SPACES = [
  { slug: "ui-sandbox", name: "UI Sandbox" },
  { slug: "ui-production", name: "UI Production" },
] as const;

function pushStep(steps: WizardStepResult[], step: WizardStepResult): void {
  steps.push(step);
}

function wizardStepError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : "Step failed";
  const code = error instanceof WizardHubError ? error.code : "WIZARD_STEP_FAILED";
  return { code, message };
}

function resolveHandoffFlowId(projectPath: string): string | undefined {
  try {
    const flows = readSpaceApplyBundle(projectPath).flows ?? [];
    return flows[0]?.flow_id;
  } catch {
    return undefined;
  }
}

async function promptWithExamples(options: { yes?: boolean; json?: boolean }): Promise<boolean> {
  if (options.json || options.yes) {
    return false;
  }
  const answer = await p.confirm({
    message: "Include example flow and starter files?",
    initialValue: false,
  });
  if (p.isCancel(answer)) {
    p.cancel("Setup cancelled — partial progress saved");
    process.exit(0);
  }
  return Boolean(answer);
}

async function runSetupWizard(options: {
  projectPath: string;
  flags: ReturnType<typeof parseGlobalFlags>;
  yes: boolean;
  json: boolean;
}): Promise<WizardRunResult> {
  const { projectPath, flags, yes, json } = options;
  const steps: WizardStepResult[] = [];
  let linkedSpaceId: string | undefined;
  let hubUrl = flags.hubUrl ?? DEFAULT_HUB_URL;
  let grantToken: string | undefined;
  let mcpSnippet: string | undefined;

  if (json && !yes) {
    console.log(JSON.stringify(buildSetupJsonPlan({ yes }), null, 2));
    process.exit(0);
  }

  if (!json) {
    p.intro("Murrmure setup");
  }

  if (json || (await confirmStep("Step 1 — Connect hub URL and token?", { yes }))) {
    if (!json && !yes) {
      hubUrl = await promptText("Hub URL", {
        placeholder: DEFAULT_HUB_URL,
        defaultValue: hubUrl,
      });
      const token = await promptPassword("Bearer token (tok_…)", (value) => {
        if (!value?.trim()) return "Token is required";
      });
      const login = await validateAndSaveLogin(hubUrl, token);
      if (!login.ok) {
        printErr(login.code, login.message);
      }
      if (!json) {
        p.log.success(`Connected as ${login.whoami.actor_id}`);
      }
      pushStep(steps, { id: "connect", ok: true, detail: { actor_id: login.whoami.actor_id } });
    } else {
      pushStep(steps, { id: "connect", ok: true, skipped: true, detail: { note: "using saved credentials" } });
    }
  } else {
    pushStep(steps, { id: "connect", ok: true, skipped: true });
  }

  const { auth } = await runGlobalScopePreflight(flags, "space:admin");
  hubUrl = auth.hubUrl;
  const createdSpaceIds: string[] = [];

  if (json || (await confirmStep("Step 2 — Create default spaces (ui-sandbox, ui-production)?", { yes }))) {
    for (const defaults of DEFAULT_SPACES) {
      if (!json && !yes) {
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
      if (!json) {
        p.log.success(`Created ${space.space_id}`);
      }
    }
    pushStep(steps, { id: "spaces", ok: true, detail: { created: createdSpaceIds } });
  } else {
    pushStep(steps, { id: "spaces", ok: true, skipped: true });
  }

  if (json || (await confirmStep("Step 3 — Scaffold murrmure/, link, and apply?", { yes }))) {
    let initOk = true;
    const withExamples = await promptWithExamples({ yes, json });

    try {
      if (!existsSync(resolve(projectPath, ".mrmr"))) {
        const initResult = await wizardSpaceInit(projectPath, { withSkill: true, withExamples });
        if (!json) {
          p.log.success(`Scaffolded murrmure/ (${initResult.created.length} files)`);
          if (initResult.skill_installed && initResult.skill_path) {
            p.log.success(`Installed skill → ${initResult.skill_path}`);
          }
        }
        pushStep(steps, {
          id: "init",
          ok: true,
          detail: {
            created: initResult.created.length,
            skill_installed: initResult.skill_installed,
            with_examples: withExamples,
          },
        });
      } else {
        pushStep(steps, { id: "init", ok: true, skipped: true, detail: { note: ".mrmr/ exists" } });
      }
    } catch (error) {
      pushStep(steps, { id: "init", ok: false, error: wizardStepError(error) });
      initOk = false;
    }

    let linkOk = initOk;
    if (initOk) {
      try {
        const linkSpaceId = createdSpaceIds[0] ?? flags.space;
        const linkResult = await wizardSpaceLink(flags, projectPath, {
          spaceId: linkSpaceId,
          create: !linkSpaceId,
        });
        linkedSpaceId = linkResult.space_id;
        if (!json) {
          p.log.success(`Linked ${projectPath} → ${linkedSpaceId}`);
        }
        pushStep(steps, { id: "link", ok: true, detail: { space_id: linkedSpaceId, created: linkResult.created } });
      } catch (error) {
        pushStep(steps, { id: "link", ok: false, error: wizardStepError(error) });
        linkOk = false;
      }
    } else {
      pushStep(steps, { id: "link", ok: true, skipped: true });
    }

    if (linkOk) {
      try {
        const applyBody = await wizardSpaceApply(flags, projectPath, linkedSpaceId!);
        if (!json) {
          p.log.success("Applied murrmure/ index to hub");
        }
        pushStep(steps, { id: "apply", ok: true, detail: { warnings: applyBody.warnings } });
      } catch (error) {
        const { code, message } = wizardStepError(error);
        pushStep(steps, { id: "apply", ok: false, error: { code, message } });
        if (json) {
          return { ok: false, project_path: projectPath, space_id: linkedSpaceId, steps };
        }
        printErr(code, message);
      }
    } else {
      pushStep(steps, { id: "apply", ok: true, skipped: true });
      if ((!initOk || !linkOk) && json) {
        return { ok: false, project_path: projectPath, space_id: linkedSpaceId, steps };
      }
    }
  } else {
    pushStep(steps, { id: "init", ok: true, skipped: true });
    pushStep(steps, { id: "link", ok: true, skipped: true });
    pushStep(steps, { id: "apply", ok: true, skipped: true });
  }

  if (!json && (await confirmStep("Step 4 — Install murrmure skill in this repo?", { yes }))) {
    const skill = installMurrmureSkill(projectPath);
    p.log.success(`Installed skill → ${skill.path} (v${skill.version})`);
    pushStep(steps, { id: "skill", ok: true, detail: { path: skill.path, version: skill.version } });
  } else if (json) {
    pushStep(steps, { id: "skill", ok: true, skipped: true });
  }

  if (json || (await confirmStep("Step 5 — Mint agent grant and show MCP config?", { yes }))) {
    if (!linkedSpaceId) {
      pushStep(steps, {
        id: "grant",
        ok: false,
        error: { code: "NO_SPACE", message: "No linked space — complete link step first" },
      });
    } else {
      try {
        const grant = await wizardMintAgentGrant(auth, linkedSpaceId);
        grantToken = grant.token;
        mcpSnippet = grant.mcp_snippet;
        if (!json) {
          if (grant.token) {
            p.note(
              `Save this token now — it will not be shown again:\n\n  ${grant.token}`,
              "One-time grant token",
            );
          }
          p.note(grant.mcp_snippet, "Paste into .cursor/mcp.json");
        }
        pushStep(steps, {
          id: "grant",
          ok: true,
          detail: { grant_id: grant.grant_id, capabilities: [...grant.capabilities] },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Grant mint failed";
        const code = error instanceof WizardHubError ? error.code : "GRANT_FAILED";
        if (!json) {
          p.log.warn(`Grant mint failed: ${message}`);
        }
        pushStep(steps, { id: "grant", ok: false, error: { code, message } });
      }
    }
  } else {
    pushStep(steps, { id: "grant", ok: true, skipped: true });
  }

  if (linkedSpaceId) {
    try {
      const status = await wizardSpaceStatus(flags, projectPath, linkedSpaceId);
      pushStep(steps, { id: "status", ok: true, detail: { counts: status.counts } });
    } catch {
      pushStep(steps, { id: "status", ok: true, skipped: true });
    }
  }

  const ok = steps.every((step) => step.ok || step.skipped);
  const handoffFlowId = linkedSpaceId ? resolveHandoffFlowId(projectPath) : undefined;

  if (!json) {
    if (linkedSpaceId) {
      printDesktopHandoff({ hubUrl, spaceId: linkedSpaceId, flowId: handoffFlowId });
    }
    p.outro(ok ? "Setup complete — open Desktop and Run your flow" : "Setup finished with errors — run `mrmr doctor`");
  }

  return {
    ok,
    project_path: projectPath,
    space_id: linkedSpaceId,
    steps,
    mcp_snippet: mcpSnippet,
    desktop_handoff: linkedSpaceId
      ? {
          hub_url: hubUrl,
          space_id: linkedSpaceId,
          ...(handoffFlowId ? { flow_id: handoffFlowId } : {}),
        }
      : undefined,
  };
}

export const setupCommand = defineCommand({
  meta: {
    name: "setup",
    description:
      "First-run wizard: connect → spaces → init → link → apply → skill → grant + MCP (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root for murrmure/ scaffold (default: .)",
    },
    yes: {
      type: "boolean",
      description: "Non-interactive — accept defaults (CI smoke)",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const yes = Boolean(args.yes);
    const projectPath = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());

    const result = await runSetupWizard({
      projectPath,
      flags,
      yes,
      json: flags.json,
    });

    if (flags.json) {
      printOk(result as unknown as Record<string, unknown>);
    }

    if (!result.ok) {
      process.exit(1);
    }
  },
}) as CommandDef;
