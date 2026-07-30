import { colors } from "consola/utils";
import { cliConsola } from "./output.js";
import {
  coalesceDoctorIssues,
  formatDoctorHuman,
  type DoctorIssue,
  type DoctorResult,
  type DoctorSpaceProfile,
  type SpaceCapabilities,
} from "./doctor.js";

const consola = cliConsola;
const indent = "  ";

function useColorOutput(): boolean {
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  if (process.env.NO_COLOR) {
    return false;
  }
  return Boolean(process.stderr.isTTY);
}

function statusOk(text: string): string {
  return colors.green(`● ${text}`);
}

function statusBad(text: string): string {
  return colors.red(`● ${text}`);
}

function statusWarn(text: string): string {
  return colors.yellow(`○ ${text}`);
}

function row(label: string, value: string): void {
  consola.log(`${indent}${colors.dim(label.padEnd(10))} ${value}`);
}

function shortenHomePath(path: string): string {
  const home = process.env.HOME?.trim();
  if (home && path.startsWith(`${home}/`)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function capabilityLine(capabilities: SpaceCapabilities): string {
  const parts = [
    capabilities.can_mint_grants ? "admin" : null,
    capabilities.can_apply_space ? "apply" : null,
    capabilities.can_register_triggers ? "triggers" : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? colors.dim(parts.join(" · ")) : colors.dim("limited");
}

function issueSeverity(issue: DoctorIssue): "error" | "warning" | "info" {
  return issue.severity ?? "error";
}

function renderVerdict(result: DoctorResult, errors: DoctorIssue[], notes: DoctorIssue[]): void {
  if (errors.length > 0) {
    consola.error(
      errors.length === 1
        ? "1 blocking issue"
        : `${errors.length} blocking issues`,
    );
    return;
  }
  if (notes.length > 0) {
    consola.warn(
      notes.length === 1 ? "1 note to review" : `${notes.length} notes to review`,
    );
    return;
  }
  if (result.ok) {
    consola.success("Hub and auth look good");
  }
}

function renderOverview(result: DoctorResult): void {
  const { profile } = result;
  consola.log("");
  consola.info(colors.bold("Overview"));

  if (profile.hub_url) {
    row(
      "Hub",
      profile.hub_reachable ? statusOk(profile.hub_url) : statusBad(profile.hub_url),
    );
  } else {
    row("Hub", statusWarn("not configured"));
  }

  const authBits = [
    profile.auth_source ?? "none",
    profile.token_valid ? "token ok" : "token invalid",
    profile.bootstrap_token ? "bootstrap" : null,
  ].filter((bit): bit is string => Boolean(bit));
  row(
    "Auth",
    profile.token_valid ? statusOk(authBits.join(" · ")) : statusBad(authBits.join(" · ")),
  );

  if (profile.whoami) {
    row(
      "Actor",
      `${colors.bold(profile.whoami.actor_id)} ${colors.dim(`(${profile.whoami.kind})`)}`,
    );
  }
}

function spaceHeading(entry: DoctorSpaceProfile): string {
  const label = entry.slug ?? entry.name;
  if (label) {
    return `${colors.bold(label)} ${colors.dim(entry.space_id)}`;
  }
  return colors.bold(entry.space_id);
}

function renderSpace(entry: DoctorSpaceProfile): void {
  consola.log(`${indent}${spaceHeading(entry)}`);
  consola.log(`${indent}  ${capabilityLine(entry.capabilities)}`);
  if (!entry.executors?.length) {
    return;
  }
  for (const ex of entry.executors) {
    const mark =
      ex.reachable === true
        ? colors.green("✓")
        : ex.reachable === false
          ? colors.red("✗")
          : colors.dim("·");
    const detail = ex.detail ? colors.dim(` — ${ex.detail}`) : "";
    consola.log(`${indent}  ${mark} ${ex.name}${detail}`);
  }
}

function renderSpaces(result: DoctorResult): void {
  const spaces = result.profile.spaces;
  consola.log("");
  consola.info(colors.bold("Spaces"));
  if (spaces.length === 0) {
    row("", statusWarn("none"));
    return;
  }
  for (const entry of spaces) {
    renderSpace(entry);
  }
}

function renderIssueBlock(issue: DoctorIssue, kind: "error" | "warning"): void {
  if (kind === "error") {
    consola.error(issue.message);
  } else {
    consola.warn(issue.message);
  }
  for (const path of issue.paths ?? []) {
    consola.log(`${indent}${colors.dim(shortenHomePath(path))}`);
  }
  if (issue.fix) {
    consola.log(`${indent}${colors.cyan("→")} ${issue.fix}`);
  }
}

function renderIssues(errors: DoctorIssue[], notes: DoctorIssue[]): void {
  if (errors.length > 0) {
    consola.log("");
    consola.info(colors.bold("Issues"));
    for (const issue of errors) {
      renderIssueBlock(issue, "error");
    }
  }

  if (notes.length === 0) {
    return;
  }

  consola.log("");
  if (notes.length === 1 && notes[0]?.fix) {
    const note = notes[0];
    const lines = [note.message];
    for (const path of note.paths ?? []) {
      lines.push(colors.dim(shortenHomePath(path)));
    }
    lines.push("", colors.cyan(note.fix));
    consola.box({
      title: "Note",
      message: lines.join("\n"),
      style: { borderColor: "yellow" },
    });
    return;
  }

  consola.info(colors.bold("Notes"));
  for (const issue of notes) {
    renderIssueBlock(issue, "warning");
  }
}

function renderFooter(result: DoctorResult, errors: DoctorIssue[], notes: DoctorIssue[]): void {
  consola.log("");
  if (errors.length === 0 && notes.length === 0 && result.ok) {
    consola.success("Ready");
    return;
  }
  if (errors.length === 0) {
    // Notes already carry the action — don't add a second Cursor-specific lecture.
    return;
  }
  consola.warn("Fix blocking issues, then run mrmr doctor again");
}

export function printDoctorHuman(result: DoctorResult): void {
  if (!useColorOutput()) {
    console.log(formatDoctorHuman(result));
    return;
  }

  const issues = coalesceDoctorIssues(result.issues);
  const errors = issues.filter((issue) => issueSeverity(issue) === "error");
  const notes = issues.filter((issue) => issueSeverity(issue) === "warning");

  consola.log("");
  consola.log(colors.bold("Doctor"));
  renderVerdict(result, errors, notes);
  renderOverview(result);
  renderSpaces(result);
  renderIssues(errors, notes);
  renderFooter(result, errors, notes);
}
