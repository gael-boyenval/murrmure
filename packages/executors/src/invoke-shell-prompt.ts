/** Render an invoke param as inline prompt text (not shell-quoted). */
export function formatTemplateValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export const MURRMURE_TASK_BEGIN = "<!-- MURRMURE_TASK_BEGIN -->";
export const MURRMURE_TASK_END = "<!-- MURRMURE_TASK_END -->";
export const MURRMURE_PROTOCOL_BEGIN = "<!-- MURRMURE_PROTOCOL_BEGIN -->";
export const MURRMURE_PROTOCOL_END = "<!-- MURRMURE_PROTOCOL_END -->";

export interface InvokeTemplateContext {
  action_name: string;
  space_id: string;
  run_id?: string;
  session_id?: string;
  space_root?: string;
  params?: Record<string, unknown>;
  murrmure_bindings?: Record<string, string>;
  /** Full path to active-step-contract.json when step contracts are active. */
  step_contract_path?: string;
  /** Absolute step workdir when step contracts are active. */
  step_workdir?: string;
}

export interface MurrmureProtocolRenderInput {
  run_id: string;
  session_id?: string;
  space_id?: string;
  action_name: string;
  space_root: string;
  contract_markdown: string;
  contract_path?: string;
  workdir?: string;
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

  if (context.murrmure_bindings) {
    for (const [key, value] of Object.entries(context.murrmure_bindings)) {
      bindings[`murrmure.${key}`] = value;
    }
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

/** Strip protocol placeholders authors may still embed; hub injects protocol separately. */
export function stripMurrmureProtocolPlaceholders(template: string): string {
  return template
    .replace(/\{\{murrmure\.agentStepContract\}\}\s*/g, "")
    .replace(
      /During the loop, re-read:\s*\n\s*\{\{murrmure\.space_root\}\}\/\.mrmr\.temp\/runs\/\{\{murrmure\.run_id\}\}\/active-step-contract\.json\s*/g,
      "",
    )
    .replace(
      /Re-read contract after each transition:\s*\n\s*\{\{murrmure\.space_root\}\}\/\.mrmr\.temp\/runs\/\{\{murrmure\.run_id\}\}\/active-step-contract\.json\s*/g,
      "",
    )
    .trim();
}

export function assembleStructuredAgentPrompt(input: {
  taskBody: string;
  protocol?: MurrmureProtocolRenderInput;
  renderProtocol?: (ctx: MurrmureProtocolRenderInput) => string;
}): string {
  const taskBody = input.taskBody.trim();
  if (!input.protocol) return taskBody;

  const render = input.renderProtocol ?? defaultMurrmureProtocolRender;
  const protocolBody = render(input.protocol);

  return [
    MURRMURE_TASK_BEGIN,
    "# Task",
    "",
    taskBody,
    MURRMURE_TASK_END,
    "",
    MURRMURE_PROTOCOL_BEGIN,
    protocolBody,
    MURRMURE_PROTOCOL_END,
  ].join("\n");
}

/** Injected at runtime by hub-daemon when step contracts are active. */
let murrmureProtocolRenderer: ((ctx: MurrmureProtocolRenderInput) => string) | undefined;

export function setMurrmureProtocolRenderer(
  renderer: (ctx: MurrmureProtocolRenderInput) => string,
): void {
  murrmureProtocolRenderer = renderer;
}

function defaultMurrmureProtocolRender(ctx: MurrmureProtocolRenderInput): string {
  if (murrmureProtocolRenderer) return murrmureProtocolRenderer(ctx);
  return [
    "# Murrmure protocol (auto-generated — authoritative)",
    "",
    `Run: ${ctx.run_id}`,
    ctx.session_id ? `Session: ${ctx.session_id}` : "",
    `Action: ${ctx.action_name}`,
    "",
    ctx.contract_markdown,
  ]
    .filter(Boolean)
    .join("\n");
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
  const contractMarkdown = context.murrmure_bindings?.agentStepContract?.trim();

  let taskBody: string;
  if (promptTemplate?.trim()) {
    const taskTemplate = stripMurrmureProtocolPlaceholders(promptTemplate);
    taskBody = resolveActionTemplate(taskTemplate, bindings).trim();
  } else {
    taskBody = formatInvokeShellPrompt(context.action_name, context.params, {
      run_id: context.run_id,
      session_id: context.session_id,
    });
  }

  const briefing = context.murrmure_bindings?.spaceBriefing?.trim();
  const briefingPath = context.murrmure_bindings?.spaceBriefingPath ?? ".mrmr.temp/briefing.md";
  if (briefing) {
    taskBody = [
      "## Space briefing (from `mrmr space apply` — read before exploring)",
      "",
      `Full file: \`${briefingPath}\``,
      "",
      briefing,
      "",
      "---",
      "",
      taskBody,
    ].join("\n");
  }

  if (!contractMarkdown || !context.run_id) {
    return taskBody;
  }

  return assembleStructuredAgentPrompt({
    taskBody,
    protocol: {
      run_id: context.murrmure_bindings?.run_id ?? context.run_id,
      session_id: context.session_id,
      space_id: context.space_id,
      action_name: context.action_name,
      space_root: context.space_root ?? ".",
      contract_markdown: contractMarkdown,
      contract_path: context.step_contract_path,
      workdir: context.step_workdir,
    },
  });
}
