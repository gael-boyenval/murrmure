import {
  isMeetingWakeParams,
  meetingWakeGoalFields,
  normalizeMeetingWakeTrigger,
  renderMurrmureMeetingProtocolEnvelope,
} from "@murrmure/hub-core";

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

function formatMeetingWake(params: InvokeActionParams): string {
  const data = params.params ?? {};
  const message_id = typeof data.message_id === "string" && data.message_id ? data.message_id : undefined;
  const wake = {
    session_id: String(data.session_id ?? params.session_id ?? ""),
    participant_id: String(data.participant_id ?? ""),
    message_id,
    trigger: normalizeMeetingWakeTrigger(data.trigger, message_id),
    since_seq: Number(data.since_seq ?? 0),
    ...meetingWakeGoalFields(data),
  };
  const instruction = readTaskInstruction(data);
  const lines = [
    "Murrmure control wake: action invoke",
    "",
    `Action: ${String(params.action_name ?? "unknown")}`,
  ];
  if (params.run_id) lines.push(`Run: ${params.run_id}`);
  if (wake.session_id) lines.push(`Session: ${wake.session_id}`);
  if (instruction) {
    lines.push("", "Instruction:", instruction);
  }
  lines.push(
    "",
    "Data:",
    JSON.stringify(
      {
        session_id: wake.session_id,
        participant_id: wake.participant_id,
        trigger: wake.trigger,
        message_id: wake.message_id,
        since_seq: wake.since_seq,
      },
      null,
      2,
    ),
    "",
    renderMurrmureMeetingProtocolEnvelope(wake),
  );
  return lines.join("\n").trim();
}

export function formatInvokeActionWake(params: InvokeActionParams): string {
  if (isMeetingWakeParams(params.params)) {
    return formatMeetingWake(params);
  }
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

export function formatMeetingSaidWake(params: {
  session_id?: string;
  participant_id?: string;
  message_id?: string;
  since_seq?: number;
  handler_id?: string;
  goal?: string;
  subject?: string;
}): string {
  const wake = {
    session_id: String(params.session_id ?? ""),
    participant_id: String(params.participant_id ?? ""),
    trigger: "said" as const,
    message_id: String(params.message_id ?? ""),
    since_seq: Number(params.since_seq ?? 0),
    ...meetingWakeGoalFields(params),
  };
  const lines = [
    "Murrmure control wake: meeting said",
    "",
    `session_id: ${wake.session_id}`,
    `participant_id: ${wake.participant_id}`,
    `message_id: ${wake.message_id}`,
    `since_seq: ${wake.since_seq}`,
  ];
  if (params.handler_id) lines.push(`handler_id: ${params.handler_id}`);
  lines.push("", renderMurrmureMeetingProtocolEnvelope(wake));
  return lines.join("\n").trim();
}

export function formatControlWake(
  method: string,
  params: Record<string, unknown>,
): string | null {
  if (method === "murrmure/control.invoke_action") {
    return formatInvokeActionWake(params as InvokeActionParams);
  }
  if (method === "murrmure/control.meeting_said") {
    return formatMeetingSaidWake(params);
  }
  return null;
}
