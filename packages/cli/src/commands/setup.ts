import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { printErr, printOk } from "../lib/output.js";
import { runGlobalScopePreflight } from "../lib/preflight.js";
import { readSpaceApplyBundle } from "../lib/space-directory.js";
import { writeSpaceIdentity } from "../lib/space-scaffold.js";
import { installMurrmureSkill } from "../skill/install.js";
import { confirmStep, promptText } from "../wizard/interactive.js";
import { buildSetupJsonPlan, type WizardRunResult, type WizardStepResult } from "../wizard/json.js";
import { printDesktopHandoff } from "../wizard/outro.js";
import {
  normalizeSpaceSlug,
  resolveSpaceIdentity,
  validateSpaceName,
  validateSpaceSlug,
  type SpaceIdentity,
} from "../wizard/space-naming.js";
import {
  WizardHubError,
  wizardCreateNamedSpace,
  wizardSpaceApply,
  wizardSpaceInit,
  wizardSpaceLink,
  wizardSpaceStatus,
} from "../wizard/space-ops.js";

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

async function resolveWizardSpaceIdentity(options: {
  projectPath: string;
  yes: boolean;
  json: boolean;
  name?: string;
  slug?: string;
}): Promise<SpaceIdentity> {
  const defaults = resolveSpaceIdentity(options.projectPath, {
    name: options.name,
    slug: options.slug,
  });
  if (options.yes || options.json) {
    return defaults;
  }
  const name = await promptText("Space name", {
    defaultValue: defaults.name,
    placeholder: defaults.name,
    validate: validateSpaceName,
  });
  const derivedSlug = options.slug ?? normalizeSpaceSlug(name);
  const slug = await promptText("Space slug", {
    defaultValue: derivedSlug,
    placeholder: derivedSlug,
    validate: validateSpaceSlug,
  });
  return resolveSpaceIdentity(options.projectPath, { name, slug });
}

export async function runSetupWizard(options: {
  projectPath: string;
  flags: ReturnType<typeof parseGlobalFlags>;
  yes: boolean;
  json: boolean;
  name?: string;
  slug?: string;
}): Promise<WizardRunResult> {
  const { projectPath, flags, yes, json } = options;
  const steps: WizardStepResult[] = [];
  let linkedSpaceId: string | undefined;

  if (json && !yes) {
    console.log(JSON.stringify(buildSetupJsonPlan({ yes }), null, 2));
    process.exit(0);
  }

  if (!json) {
    p.intro("Murrmure setup");
  }

  const { auth } = await runGlobalScopePreflight(flags, "space:admin");
  const hubUrl = auth.hubUrl;
  let identity = await resolveWizardSpaceIdentity({
    projectPath,
    yes,
    json,
    name: options.name,
    slug: options.slug,
  });
  let createdSpaceId: string | undefined;

  while (!createdSpaceId) {
    try {
      const space = await wizardCreateNamedSpace(auth, identity);
      createdSpaceId = space.space_id;
      if (!json) {
        p.log.success(`Created ${space.name} (${space.slug}) → ${space.space_id}`);
      }
      pushStep(steps, {
        id: "spaces",
        ok: true,
        detail: { created: [space.space_id], name: identity.name, slug: identity.slug },
      });
    } catch (error) {
      const collision = error instanceof WizardHubError && error.code === "space_exists";
      if (!collision || json || yes) {
        pushStep(steps, { id: "spaces", ok: false, error: wizardStepError(error) });
        return { ok: false, project_path: projectPath, steps };
      }
      p.log.warn(`Slug "${identity.slug}" is already used`);
      const nextSlug = await promptText("Choose another space slug", {
        defaultValue: `${identity.slug}-2`,
        validate: validateSpaceSlug,
      });
      identity = { ...identity, slug: nextSlug };
    }
  }

  if (json || (await confirmStep("Step 2 — Scaffold .mrmr/, link, and apply?", { yes }))) {
    let initOk = true;
    const withExamples = await promptWithExamples({ yes, json });

    try {
      if (!existsSync(resolve(projectPath, ".mrmr"))) {
        const initResult = await wizardSpaceInit(projectPath, {
          withSkill: false,
          withExamples,
          ...identity,
        });
        if (!json) {
          p.log.success(`Scaffolded .mrmr/ (${initResult.created.length} files)`);
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
        writeSpaceIdentity(projectPath, identity);
        pushStep(steps, { id: "init", ok: true, skipped: true, detail: { note: ".mrmr/ exists" } });
      }
    } catch (error) {
      pushStep(steps, { id: "init", ok: false, error: wizardStepError(error) });
      initOk = false;
    }

    let linkOk = initOk;
    if (initOk) {
      try {
        const linkResult = await wizardSpaceLink(flags, projectPath, {
          spaceId: createdSpaceId,
          create: false,
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
          p.log.success("Applied .mrmr/ index to Hub");
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

  if (!json && (await confirmStep("Step 3 — Install Murrmure skills in this repo?", { yes }))) {
    const skill = installMurrmureSkill(projectPath);
    p.log.success(`Installed skill → ${skill.path} (v${skill.version})`);
    pushStep(steps, { id: "skill", ok: true, detail: { path: skill.path, version: skill.version } });
  } else if (json) {
    pushStep(steps, { id: "skill", ok: true, skipped: true });
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
      "First-run wizard: name space → init → link → apply → skill (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root for murrmure/ scaffold (default: .)",
    },
    name: {
      type: "string",
      description: "Space display name (default: project folder name)",
    },
    slug: {
      type: "string",
      description: "Space slug (default: normalized display name)",
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
      name: typeof args.name === "string" ? args.name : undefined,
      slug: typeof args.slug === "string" ? args.slug : undefined,
    });

    if (flags.json) {
      printOk(result as unknown as Record<string, unknown>);
    }

    if (!result.ok) {
      process.exit(1);
    }
  },
}) as CommandDef;
