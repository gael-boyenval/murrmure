export interface InvokeActionParams {
  action_name?: string;
  step_id?: string;
  run_id?: string;
  session_id?: string;
  params?: Record<string, unknown>;
  expect?: unknown;
  artifacts_in?: unknown;
  executor_id?: string;
}

function formatParamsBlock(params: Record<string, unknown> | undefined): string {
  if (!params || Object.keys(params).length === 0) return "";
  const { instruction, prompt, ...data } = params;
  void instruction;
  void prompt;
  if (Object.keys(data).length === 0) return "";
  return `\nData:\n${JSON.stringify(data, null, 2)}\n`;
}

function readTaskInstruction(params: Record<string, unknown> | undefined): string | undefined {
  if (!params) return undefined;
  for (const key of ["instruction", "prompt"] as const) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function formatInvokeActionWake(params: InvokeActionParams): string {
  const actionName = String(params.action_name ?? "unknown");
  const instruction = readTaskInstruction(params.params);
  const lines = [
    "Murrmure control wake: action invoke",
    "",
    `Action: ${actionName}`,
  ];
  if (params.run_id) lines.push(`Run: ${params.run_id}`);
  if (params.session_id) lines.push(`Session: ${params.session_id}`);
  if (params.step_id) lines.push(`Step: ${params.step_id}`);
  if (instruction) {
    lines.push("", "Instruction:", instruction);
  }
  lines.push(formatParamsBlock(params.params));
  if (!instruction) {
    lines.push(
      "Execute this indexed action using your Murrmure tools and local workspace access.",
    );
  }
  lines.push("", "When finished, confirm what you did (files written, commands run, or blockers).");
  return lines.join("\n").trim();
}

export function formatControlWake(
  method: string,
  params: Record<string, unknown>,
): string | null {
  if (method === "murrmure/control.invoke_action") {
    return formatInvokeActionWake(params as InvokeActionParams);
  }
  return null;
}
