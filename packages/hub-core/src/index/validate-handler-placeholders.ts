/**
 * Handler placeholder catalog, quick-fix hints, and apply-time validation.
 * Canonical step-output form: `{{murrmure.step.<id>.output.<field>}}`.
 * Legacy `{{steps.*}}` and `{{murrmure.steps.*}}` are rejected (no alias).
 */

import type { HandlerSpec } from "@murrmure/contracts";

export type HandlerPlaceholderValidation =
  | { ok: true }
  | { ok: false; code: string; message: string; handler_id?: string };

/** Bare keys always allowed in command/prompt (params may add more at runtime). */
const BARE_ALLOWED = new Set([
  "prompt",
  "run_id",
  "session_id",
  "space_id",
  "space_root",
  "action_name",
  "instruction",
]);

const MURRMURE_ATOMIC = new Set([
  "run_id",
  "space_root",
  "agentStepContract",
  "inputs.json",
  "handlerScopeContract",
  "contractKeyCount",
]);

const QUALIFIED_STEP =
  /^step\.([a-zA-Z0-9_.-]+)\.(description|workdir|iteration)$/;
const QUALIFIED_ARTIFACT =
  /^step\.([a-zA-Z0-9_.-]+)\.artifact\.([a-zA-Z0-9_-]+)\.(path|directory|transfer_id)$/;
const QUALIFIED_OUTPUT =
  /^step\.([a-zA-Z0-9_.-]+)\.output\.([a-zA-Z0-9_.-]+)$/;

const PLACEHOLDER_RE = /\{\{([\w.-]+)\}\}/g;
const QUOTED_PLACEHOLDER_RE = /(['"])\{\{[\w.-]+\}\}\1/;
const EMBEDDED_HINT_RE = /(?:[^\s'"{])\{\{[\w.-]+\}\}|\{\{[\w.-]+\}\}(?:[^\s'"}])/;

/** Quick-fix hints for common mistaken placeholder forms. */
export function placeholderQuickFixHint(key: string): string {
  const stepsLegacy = /^steps\.([A-Za-z0-9_.-]+)\.output\.([A-Za-z0-9_.-]+)$/.exec(key);
  if (stepsLegacy) {
    return ` Use {{murrmure.step.${stepsLegacy[1]}.output.${stepsLegacy[2]}}} (legacy {{steps.*}} is rejected).`;
  }
  const murrmureSteps = /^murrmure\.steps\.([A-Za-z0-9_.-]+)\.output\.([A-Za-z0-9_.-]+)$/.exec(
    key,
  );
  if (murrmureSteps) {
    return ` Use {{murrmure.step.${murrmureSteps[1]}.output.${murrmureSteps[2]}}} (singular "step", not "steps").`;
  }
  if (key === "murrmure.run.id" || key === "run.id") {
    return " Use {{murrmure.run_id}}.";
  }
  return (
    " Common patterns: {{murrmure.step.<id>.output.<field>}}," +
    " {{murrmure.step.<id>.artifact.<slot>.path}}, {{murrmure.run_id}};" +
    " each {{…}} must be one complete unquoted argument."
  );
}

export function collectTemplatePlaceholderKeys(template: string): string[] {
  const keys = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    if (match[1]) keys.add(match[1]);
  }
  return [...keys];
}

function isKnownMurrmurePath(tokenPath: string, knownStepIds: Set<string>): boolean {
  if (MURRMURE_ATOMIC.has(tokenPath)) return true;
  const stepMatch = tokenPath.match(QUALIFIED_STEP);
  if (stepMatch && knownStepIds.has(stepMatch[1]!)) return true;
  const artifactMatch = tokenPath.match(QUALIFIED_ARTIFACT);
  if (artifactMatch && knownStepIds.has(artifactMatch[1]!)) return true;
  const outputMatch = tokenPath.match(QUALIFIED_OUTPUT);
  if (outputMatch && knownStepIds.has(outputMatch[1]!)) return true;
  return false;
}

/**
 * Whether an authored `{{key}}` is allowed at apply time given known flow step ids.
 * Runtime params may still add bare keys; apply only rejects known-wrong and
 * unknown `murrmure.*` forms.
 */
export function isAllowedHandlerPlaceholderKey(
  key: string,
  knownStepIds: Set<string>,
): boolean {
  if (key.startsWith("steps.")) return false;
  if (key === "murrmure.run.id" || key === "run.id") return false;
  if (key.startsWith("murrmure.steps.")) return false;
  if (key.startsWith("murrmure.")) {
    return isKnownMurrmurePath(key.slice("murrmure.".length), knownStepIds);
  }
  if (BARE_ALLOWED.has(key)) return true;
  // Bare param-like keys (event hook fields, etc.) — allow simple identifiers.
  return /^[A-Za-z_][\w.-]*$/.test(key) && !key.includes("steps.");
}

function validateTemplateString(
  template: string,
  fieldLabel: string,
  handlerId: string,
  knownStepIds: Set<string>,
): HandlerPlaceholderValidation {
  if (QUOTED_PLACEHOLDER_RE.test(template)) {
    const match = template.match(QUOTED_PLACEHOLDER_RE);
    return {
      ok: false,
      code: "HANDLER_PLACEHOLDER_QUOTED",
      handler_id: handlerId,
      message: `Placeholder '${match?.[0] ?? "{{…}}"}' in ${fieldLabel} must not be quoted; remove the surrounding quotes`,
    };
  }
  if (EMBEDDED_HINT_RE.test(template)) {
    return {
      ok: false,
      code: "HANDLER_PLACEHOLDER_EMBEDDED",
      handler_id: handlerId,
      message: `Placeholder in ${fieldLabel} must occupy one complete unquoted argument (no --flag={{x}} or pre{{x}}post)`,
    };
  }
  for (const key of collectTemplatePlaceholderKeys(template)) {
    if (!isAllowedHandlerPlaceholderKey(key, knownStepIds)) {
      return {
        ok: false,
        code: "HANDLER_UNKNOWN_PLACEHOLDER",
        handler_id: handlerId,
        message: `Unknown placeholder '{{${key}}}' has no binding.${placeholderQuickFixHint(key)}`,
      };
    }
  }
  return { ok: true };
}

export interface ValidateHandlerPlaceholdersInput {
  handlers: HandlerSpec[];
  /** All step ids across post-apply flows (unqualified ids as authored). */
  step_ids: string[];
}

/**
 * Apply-time gate: quoted/embedded placeholders and unknown / legacy keys fail
 * before the applied index is replaced.
 */
export function validateHandlerPlaceholders(
  input: ValidateHandlerPlaceholdersInput,
): HandlerPlaceholderValidation {
  const knownStepIds = new Set(input.step_ids);
  for (const handler of input.handlers) {
    if (handler.type === "view_resolver") continue;
    const fields: Array<{ label: string; value?: string }> = [
      { label: "command", value: handler.command },
      { label: "prompt", value: handler.prompt },
      { label: "cwd", value: handler.cwd },
    ];
    for (const field of fields) {
      if (!field.value?.includes("{{")) continue;
      const result = validateTemplateString(
        field.value,
        field.label,
        handler.id,
        knownStepIds,
      );
      if (!result.ok) return result;
    }
  }
  return { ok: true };
}
