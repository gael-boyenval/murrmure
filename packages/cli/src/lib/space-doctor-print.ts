import { colors } from "consola/utils";
import { basename } from "node:path";
import { cliConsola } from "./output.js";
import {
  buildSpaceDoctorFixPlan,
  countHumanProblems,
  formatSpaceDoctorHuman,
  humanVisibleIssues,
  legacyManifestPaths,
  type SpaceDoctorResult,
} from "./space-doctor.js";

const consola = cliConsola;
const indent = "  ";

function statusOk(text: string): string {
  return colors.green(`● ${text}`);
}

function statusWarn(text: string): string {
  return colors.yellow(`○ ${text}`);
}

function countBadge(count: number, noun: string): string {
  const label = `${count} ${noun}${count === 1 ? "" : "s"}`;
  return count > 0 ? label : colors.dim(label);
}

function row(label: string, value: string): void {
  consola.log(`${indent}${colors.dim(label.padEnd(10))} ${value}`);
}

function spaceStatus(result: SpaceDoctorResult): string {
  const id =
    result.space_id ??
    (result.workspace.link_present ? result.workspace.linked_space_id : undefined);
  return id ? statusOk(id) : statusWarn("not linked");
}

function hubStatus(result: SpaceDoctorResult): string {
  if (!result.workspace.auth_configured) {
    return statusWarn("not configured");
  }
  const url = result.workspace.hub_url ?? result.workspace.auth_source ?? "connected";
  return statusOk(String(url));
}

function useColorOutput(): boolean {
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  if (process.env.NO_COLOR) {
    return false;
  }
  return Boolean(process.stderr.isTTY);
}

function renderVerdict(result: SpaceDoctorResult, problems: number): void {
  if (!result.ok) {
    consola.error(
      problems === 1 ? "1 blocking issue — fix before apply" : `${problems} blocking issues — fix before apply`,
    );
    return;
  }
  if (result.workspace.legacy_studio_detected && problems > 0) {
    consola.warn("Legacy Studio v1 repo — migration to Murrmure v2 needed");
    return;
  }
  if (problems > 0) {
    consola.warn(problems === 1 ? "1 issue to review" : `${problems} issues to review`);
    return;
  }
  consola.success("Workspace looks good");
}

function renderOverview(result: SpaceDoctorResult): void {
  consola.log("");
  consola.info(colors.bold("Overview"));

  const name = basename(result.project_path);
  row("Project", colors.bold(name));
  row("", colors.dim(result.project_path));

  if (result.workspace.cwd !== result.project_path) {
    row("Run from", colors.yellow(result.workspace.cwd));
    row("", colors.dim(`murrmure/ lives in ${result.project_path}`));
  }

  row("Space", spaceStatus(result));
  row("Hub", hubStatus(result));

  if (result.local) {
    const { counts } = result.local;
    const localLine = [
      countBadge(counts.flows, "flow"),
      countBadge(counts.actions, "action"),
      countBadge(counts.hooks, "hook"),
    ].join(colors.dim(" · "));
    row("Local", localLine);
  }

  if (result.hub) {
    const { counts } = result.hub;
    const hubLine = [
      countBadge(counts.flows, "indexed flow"),
      countBadge(counts.actions, "indexed action"),
    ].join(colors.dim(" · "));
    row("Hub index", hubLine);
  }
}

function renderLegacySection(result: SpaceDoctorResult): void {
  if (!result.workspace.legacy_studio_detected) {
    return;
  }

  const lines: string[] = [
    "This repo still uses @studio/capability (v1 FDK).",
    "Murrmure v2 only picks up murrmure/flows/*/flow.manifest.yaml.",
  ];

  const manifests = legacyManifestPaths(result);
  if (manifests.length === 1) {
    lines.push("", colors.dim("Legacy manifest"), colors.yellow(manifests[0]!));
  } else if (manifests.length > 1) {
    lines.push("", colors.dim(`${manifests.length} legacy manifests`));
    for (const manifest of manifests.slice(0, 4)) {
      lines.push(`  ${colors.yellow("›")} ${manifest}`);
    }
    if (manifests.length > 4) {
      lines.push(`  ${colors.dim(`…and ${manifests.length - 4} more`)}`);
    }
  }

  if (result.local && result.local.counts.flows === 0 && result.local.counts.actions === 0) {
    lines.push("", colors.yellow("murrmure/ exists but is empty — scaffold v2 files before linking."));
  } else if (!result.workspace.murrmure_present) {
    lines.push("", colors.yellow("No murrmure/ directory yet."));
  }

  consola.log("");
  consola.box({
    title: "Legacy Studio v1 — migration needed",
    message: lines.join("\n"),
    style: { borderColor: "yellow" },
  });
}

function renderProblems(result: SpaceDoctorResult): void {
  const visible = humanVisibleIssues(result).filter(
    (issue) => issue.severity !== "info" && !issue.code.startsWith("MCP_"),
  );
  if (visible.length === 0) {
    return;
  }

  consola.log("");
  consola.info(colors.bold("Problems"));
  for (const issue of visible) {
    if (issue.severity === "error") {
      consola.error(issue.message);
    } else {
      consola.warn(issue.message);
    }
  }
}

function renderFixPlan(result: SpaceDoctorResult): void {
  const plan = buildSpaceDoctorFixPlan(result);
  if (plan.length === 0) {
    return;
  }

  consola.log("");
  consola.info(colors.bold("Next steps"));
  for (const [index, step] of plan.entries()) {
    const number = colors.dim(`${index + 1}.`);
    if (step.command.startsWith("#")) {
      consola.log(`${indent}${number} ${colors.dim(step.command.slice(1).trim())}`);
      if (step.why) {
        consola.log(`${indent}   ${colors.dim(step.why)}`);
      }
      continue;
    }

    consola.log(`${indent}${number} ${colors.cyan(step.command)}`);
    if (step.why) {
      consola.log(`${indent}   ${colors.dim(step.why)}`);
    }
  }
}

function renderMcpSection(result: SpaceDoctorResult): void {
  const mcpIssues = result.issues.filter(
    (issue) => issue.code.startsWith("MCP_") && issue.severity !== "info",
  );
  if (!result.mcp && mcpIssues.length === 0) {
    return;
  }

  consola.log("");
  consola.info(colors.bold("MCP (Cursor agent)"));

  if (result.mcp?.config_paths.length) {
    for (const configPath of result.mcp.config_paths) {
      row("Config", colors.dim(configPath));
    }
    for (const server of result.mcp.servers) {
      const env = server.env;
      const spaceId = env.MURRMURE_SPACE_ID ?? colors.dim("missing");
      row("Server", `${colors.cyan(server.name)} · space ${spaceId}`);
    }
  } else {
    row("Config", statusWarn("missing .cursor/mcp.json"));
  }

  for (const issue of mcpIssues) {
    if (issue.severity === "error") {
      consola.error(issue.message);
    } else {
      consola.warn(issue.message);
    }
  }

  if (result.mcp?.suggested_snippet && mcpIssues.length > 0) {
    consola.box({
      title: "Suggested .cursor/mcp.json",
      message: result.mcp.suggested_snippet,
      style: { borderColor: "cyan" },
    });
  }
}

function renderTests(result: SpaceDoctorResult): void {
  const tests = result.tests;
  if (!tests || tests.files.length === 0) {
    return;
  }

  consola.log("");
  consola.info(colors.bold("Contract tests"));
  if (tests.skipped) {
    consola.warn(tests.detail ?? "Could not run contract tests");
  } else if (tests.passed) {
    consola.success(`${tests.files.length} file(s) passed`);
  } else {
    consola.error(`${tests.files.length} file(s) failed`);
    if (tests.detail) {
      consola.log(colors.dim(tests.detail));
    }
  }
}

function renderFooter(result: SpaceDoctorResult, problems: number): void {
  consola.log("");
  if (problems === 0 && result.ok) {
    consola.success("Ready to go");
    return;
  }
  if (result.ok) {
    consola.info("Run the steps above, then mrmr space doctor again");
    return;
  }
  consola.warn("Fix blocking issues, then run mrmr space doctor again");
}

export function printSpaceDoctorHuman(result: SpaceDoctorResult): void {
  if (!useColorOutput()) {
    console.log(formatSpaceDoctorHuman(result));
    return;
  }

  const problems = countHumanProblems(result);
  consola.log("");
  consola.log(colors.bold("Space doctor"));
  renderVerdict(result, problems);
  renderOverview(result);
  renderLegacySection(result);
  renderMcpSection(result);
  renderProblems(result);
  renderTests(result);
  renderFixPlan(result);
  renderFooter(result, problems);
}
