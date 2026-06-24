import type { ValidateIssue } from "../validate.js";

function formatIssue(issue: ValidateIssue, index: number): string {
  const lines = [`  ${index + 1}. ${issue.code}: ${issue.message}`];
  if (issue.hint) {
    const hint = issue.hint;
    if (typeof hint.file === "string") lines.push(`     file: ${hint.file}`);
    if (typeof hint.state === "string") lines.push(`     state: ${hint.state}`);
    if (typeof hint.tool === "string") lines.push(`     tool: ${hint.tool}`);
    if (typeof hint.dependency === "string") lines.push(`     dependency: ${hint.dependency}`);
  }
  return lines.join("\n");
}

export function formatValidateHuman(data: Record<string, unknown>): string {
  const errors = (data.errors ?? []) as ValidateIssue[];
  const warnings = (data.warnings ?? []) as ValidateIssue[];

  if (data.ok) {
    const manifest = data.manifest as { id?: string; version?: string } | undefined;
    const id = manifest?.id ?? "flow";
    const version = manifest?.version ? `@${manifest.version}` : "";
    const lines = [`✓ ${id}${version} passed validation`];
    if (warnings.length > 0) {
      lines.push("", `Warnings (${warnings.length}):`);
      warnings.forEach((warning, index) => lines.push(formatIssue(warning, index)));
    }
    return lines.join("\n");
  }

  const lines = [`✗ Validation failed (${errors.length} error${errors.length === 1 ? "" : "s"})`];
  if (errors.length > 0) {
    lines.push("");
    errors.forEach((error, index) => lines.push(formatIssue(error, index)));
  }
  if (warnings.length > 0) {
    lines.push("", `Warnings (${warnings.length}):`);
    warnings.forEach((warning, index) => lines.push(formatIssue(warning, index)));
  }
  return lines.join("\n");
}

export function formatInitHuman(data: Record<string, unknown>): string {
  if (!data.ok) {
    return `✗ ${data.message ?? "Init failed"}`;
  }
  const path = String(data.path ?? ".");
  const lines = [`✓ Scaffolded flow at ${path}`];
  if (data.installed) {
    lines.push("  Dependencies installed via npm");
  }
  lines.push(`  Next: cd ${path} && mrmr flow validate .`);
  return lines.join("\n");
}

export function formatPushHuman(data: Record<string, unknown>): string {
  if (!data.ok) {
    return `✗ ${data.message ?? "Push failed"}`;
  }
  const installId = String(data.install_id ?? "—");
  const bundleDigest = String(data.bundle_digest ?? "—");
  const nextSteps = Array.isArray(data.next_steps) ? (data.next_steps as string[]) : [];
  const lines = [
    `✓ Pushed to hub`,
    `  Install: ${installId}`,
    `  Bundle:  ${bundleDigest}`,
  ];
  if (nextSteps.length > 0) {
    lines.push(`  Next:    ${nextSteps.join(" → ")}`);
  }
  return lines.join("\n");
}

export function formatBuildHuman(data: Record<string, unknown>): string {
  if (!data.ok) {
    const errors = (data.errors ?? []) as Array<{ code: string; message: string }>;
    if (errors.length > 0) {
      return `✗ Build failed\n  ${errors[0].code}: ${errors[0].message}`;
    }
    return `✗ Build failed`;
  }
  return `✓ Built bundle ${data.bundleDigest ?? data.bundle_digest ?? ""}\n  Stage: ${data.stageDir ?? data.stage_dir ?? "—"}`;
}

export function formatStatusHuman(data: Record<string, unknown>): string {
  const state = data.push_state as Record<string, unknown> | null | undefined;
  if (!state) {
    return "No push state — run mrmr flow push after build";
  }
  return [
    `Install:  ${state.install_id ?? "—"}`,
    `Space:    ${state.space_id ?? "—"}`,
    `Flow:     ${state.flow_id ?? "—"}@${state.version ?? "—"}`,
    `Pushed:   ${state.pushed_at ?? "—"}`,
  ].join("\n");
}

export function formatSkillHuman(data: Record<string, unknown>): string {
  if (!data.ok) {
    return `✗ ${data.message ?? "Skill command failed"}`;
  }
  if (data.command === "version") {
    return `murrmure-flow skill v${data.version ?? "?"}\n  Path: ${data.install_path ?? "—"}`;
  }
  if (data.command === "update") {
    return `✓ Updated murrmure-flow skill to v${data.version ?? "?"}\n  ${data.path ?? ""}`;
  }
  return `✓ Installed murrmure-flow skill to ${data.path ?? "—"} (v${data.version ?? "?"})`;
}
