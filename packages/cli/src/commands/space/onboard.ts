import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { discoverMurrmureProject } from "../../lib/space-doctor.js";
import { printErr, printOk } from "../../lib/output.js";
import { runGlobalScopePreflight } from "../../lib/preflight.js";
import { confirmStep } from "../../wizard/interactive.js";
import { buildOnboardJsonPlan, type WizardRunResult, type WizardStepResult } from "../../wizard/json.js";
import { printDesktopHandoff } from "../../wizard/outro.js";
import {
  WizardHubError,
  wizardSpaceApply,
  wizardSpaceLink,
  wizardSpaceStatus,
} from "../../wizard/space-ops.js";

function pushStep(steps: WizardStepResult[], step: WizardStepResult): void {
  steps.push(step);
}

async function runOnboardWizard(options: {
  projectPath: string;
  flags: ReturnType<typeof parseGlobalFlags>;
  yes: boolean;
  json: boolean;
}): Promise<WizardRunResult> {
  const { projectPath, flags, yes, json } = options;
  const steps: WizardStepResult[] = [];
  let spaceId: string | undefined;
  const { auth } = await runGlobalScopePreflight(flags, "space:read");
  const hubUrl = auth.hubUrl;

  if (json && !yes) {
    console.log(JSON.stringify(buildOnboardJsonPlan({ yes }), null, 2));
    process.exit(0);
  }

  const discovered = discoverMurrmureProject(projectPath);
  if (!discovered.murrmurePresent) {
    const message = `No murrmure/ directory at ${discovered.projectPath} — run \`mrmr setup\` first`;
    if (json) {
      printOk({
        ok: false,
        project_path: discovered.projectPath,
        steps: [{ id: "link", ok: false, error: { code: "NO_MURRMURE_DIR", message } }],
      });
      process.exit(1);
    }
    printErr("NO_MURRMURE_DIR", message, { tip: "mrmr setup" });
  }

  if (!json) {
    p.intro("Murrmure space onboard");
    p.log.info(`Project: ${discovered.projectPath}`);
  }

  if (json || (await confirmStep("Link murrmure/ to hub space?", { yes }))) {
    try {
      const existingLink = discovered.link?.space_id ?? flags.space;
      const linkResult = await wizardSpaceLink(flags, discovered.projectPath, {
        spaceId: existingLink,
        create: !existingLink,
      });
      spaceId = linkResult.space_id;
      if (!json) {
        p.log.success(`Linked → ${spaceId}`);
      }
      pushStep(steps, { id: "link", ok: true, detail: { space_id: spaceId, created: linkResult.created } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Link failed";
      const code = error instanceof WizardHubError ? error.code : "LINK_FAILED";
      pushStep(steps, { id: "link", ok: false, error: { code, message } });
      if (json) {
        return { ok: false, project_path: discovered.projectPath, steps };
      }
      printErr(code, message);
    }
  } else {
    pushStep(steps, { id: "link", ok: true, skipped: true });
    spaceId = discovered.link?.space_id ?? flags.space;
  }

  if (!spaceId) {
    printErr("USAGE", "No space id — pass --space or use --create via link");
  }

  if (json || (await confirmStep("Apply murrmure/ index to hub?", { yes }))) {
    try {
      const applyBody = await wizardSpaceApply(flags, discovered.projectPath, spaceId);
      if (!json) {
        p.log.success("Applied index");
      }
      pushStep(steps, { id: "apply", ok: true, detail: { warnings: applyBody.warnings } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apply failed";
      const code = error instanceof WizardHubError ? error.code : "APPLY_FAILED";
      pushStep(steps, { id: "apply", ok: false, error: { code, message } });
      if (json) {
        return { ok: false, project_path: discovered.projectPath, space_id: spaceId, steps };
      }
      printErr(code, message);
    }
  } else {
    pushStep(steps, { id: "apply", ok: true, skipped: true });
  }

  try {
    const status = await wizardSpaceStatus(flags, discovered.projectPath, spaceId);
    if (!json) {
      p.log.success(
        `Indexed: ${status.counts.flows ?? 0} flow(s), ${status.counts.actions ?? 0} action(s)`,
      );
      if ((status.counts.flows ?? 0) === 0) {
        p.log.info("No flows indexed — run `mrmr space flow init hello --template hello-gate`");
      }
    }
    pushStep(steps, { id: "status", ok: true, detail: { counts: status.counts } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status failed";
    const code = error instanceof WizardHubError ? error.code : "STATUS_FAILED";
    pushStep(steps, { id: "status", ok: false, error: { code, message } });
  }

  const ok = steps.every((step) => step.ok || step.skipped);

  if (!json && spaceId) {
    printDesktopHandoff({ hubUrl, spaceId });
    p.outro(ok ? "Onboard complete — open Desktop and Run" : "Onboard finished with errors — run `mrmr space doctor`");
  }

  return {
    ok,
    project_path: discovered.projectPath,
    space_id: spaceId,
    steps,
    desktop_handoff: spaceId ? { hub_url: hubUrl, space_id: spaceId } : undefined,
  };
}

export const spaceOnboardCommand = defineCommand({
  meta: {
    name: "onboard",
    description:
      "Onboard existing murrmure/: link → apply → status (Requires: space:write; --create requires space:admin)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root containing murrmure/ (default: .)",
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

    const result = await runOnboardWizard({
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
