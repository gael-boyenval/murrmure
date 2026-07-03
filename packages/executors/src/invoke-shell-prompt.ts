/** Render an invoke param as inline prompt text (not shell-quoted). */
export function formatTemplateValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export interface InvokeTemplateContext {
  action_name: string;
  space_id: string;
  run_id?: string;
  session_id?: string;
  space_root?: string;
  params?: Record<string, unknown>;
}

export function buildInvokeTemplateBindings(context: InvokeTemplateContext): Record<string, string> {
  const bindings: Record<string, string> = {
    action_name: context.action_name,
    space_id: context.space_id,
    run_id: context.run_id ?? "",
    session_id: context.session_id ?? "",
    space_root: context.space_root ?? ".",
  };

  for (const [key, value] of Object.entries(context.params ?? {})) {
    bindings[key] = formatTemplateValue(value);
  }

  return bindings;
}

/** Replace `{{key}}` placeholders using string bindings (empty when missing). */
export function resolveActionTemplate(
  template: string,
  bindings: Record<string, string>,
): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_match, key: string) => bindings[key] ?? "");
}

/** Fallback when an action has no `prompt` template. */
export function formatInvokeShellPrompt(
  actionName: string,
  params: Record<string, unknown> | undefined,
  meta?: { run_id?: string; session_id?: string },
): string {
  const instruction =
    (typeof params?.instruction === "string" && params.instruction.trim()) ||
    (typeof params?.prompt === "string" && params.prompt.trim()) ||
    "";

  const data: Record<string, unknown> = { ...(params ?? {}) };
  delete data.instruction;
  delete data.prompt;

  const lines = [`Murrmure action: ${actionName}`];
  if (meta?.run_id) lines.push(`Run: ${meta.run_id}`);
  if (meta?.session_id) lines.push(`Session: ${meta.session_id}`);
  if (instruction) {
    lines.push("", instruction);
  }
  if (Object.keys(data).length > 0) {
    lines.push("", "Data:", JSON.stringify(data, null, 2));
  }
  return lines.join("\n").trim();
}

export function resolveInvokePrompt(
  context: InvokeTemplateContext,
  promptTemplate?: string,
): string {
  const bindings = buildInvokeTemplateBindings(context);
  if (promptTemplate?.trim()) {
    return resolveActionTemplate(promptTemplate, bindings).trim();
  }
  return formatInvokeShellPrompt(context.action_name, context.params, {
    run_id: context.run_id,
    session_id: context.session_id,
  });
}
