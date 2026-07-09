import { tryParseJsonString } from "./parse-display-value.js";

export type AgentStreamEvent = {
  type: string;
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  callId?: string;
  subtype?: string;
  raw: Record<string, unknown>;
};

export type ToolInputSummaryPart = {
  key: string;
  value: string;
};

const AGENT_EVENT_TYPES = new Set([
  "assistant",
  "tool_call",
  "tool",
  "thinking",
  "result",
  "system",
  "user",
  "error",
  "progress",
]);

function normalizeEventType(type: string): string {
  if (type === "mcpToolCall" || type === "mcp_tool_call") return "tool_call";
  return type;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractText(record: Record<string, unknown>): string | undefined {
  if (typeof record.text === "string" && record.text.trim()) return record.text.trim();
  if (typeof record.message === "string" && record.message.trim()) return record.message.trim();

  const message = asRecord(record.message);
  if (!message) return undefined;

  if (typeof message.content === "string" && message.content.trim()) return message.content.trim();

  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((part) => {
        const block = asRecord(part);
        if (!block) return undefined;
        if (typeof block.text === "string") return block.text;
        if (typeof block.content === "string") return block.content;
        return undefined;
      })
      .filter((part): part is string => Boolean(part?.trim()));
    if (parts.length > 0) return parts.join("\n").trim();
  }

  return undefined;
}

function formatCursorToolKey(key: string): string {
  const match = key.match(/^(.+?)ToolCall$/i);
  if (!match) return key;
  const base = match[1] ?? key;
  if (!base) return key;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

type McpToolCallPayload = {
  name?: string;
  input?: unknown;
  result?: unknown;
};

function extractMcpToolCallPayload(record: Record<string, unknown>): McpToolCallPayload | undefined {
  const toolCallWrapper = asRecord(record.tool_call) ?? asRecord(record.toolCall);
  const wrappedPayload = asRecord(toolCallWrapper?.mcpToolCall) ?? asRecord(toolCallWrapper?.mcp_tool_call);
  const directPayload = record.type === "mcpToolCall" || record.type === "mcp_tool_call" ? record : undefined;
  const payload = wrappedPayload ?? directPayload;
  if (!payload) return undefined;

  const argsRecord = asRecord(payload.args);
  const nestedInput = argsRecord?.args ?? argsRecord?.arguments ?? argsRecord?.input;
  const extraArgs =
    argsRecord && nestedInput === undefined
      ? Object.fromEntries(
          Object.entries(argsRecord).filter(([key, value]) => {
            if (value === undefined || value === null || value === "") return false;
            return key !== "toolName" && key !== "name";
          }),
        )
      : undefined;

  return {
    name:
      (typeof argsRecord?.toolName === "string" && argsRecord.toolName.trim()) ||
      (typeof argsRecord?.name === "string" && argsRecord.name.trim()) ||
      (typeof payload.toolName === "string" && payload.toolName.trim()) ||
      (typeof payload.name === "string" && payload.name.trim()) ||
      undefined,
    input:
      nestedInput ??
      (extraArgs && Object.keys(extraArgs).length > 0 ? extraArgs : undefined) ??
      payload.input ??
      payload.arguments ??
      (!argsRecord ? payload.args : undefined),
    result: payload.result,
  };
}

function hasErrorShape(record: Record<string, unknown>): boolean {
  if (record.error !== undefined) return true;
  if (record.isError === true) return true;
  return typeof record.status === "string" && record.status.toLowerCase() === "error";
}

function extractMcpFailureFromContent(
  content: unknown,
  allowPlainText: boolean,
  depth: number,
): string | undefined {
  if (!Array.isArray(content)) return undefined;

  for (const part of content) {
    const block = asRecord(part);
    if (!block) continue;

    if (hasErrorShape(block)) {
      const detail = extractMcpFailureDetail(block, depth + 1);
      if (detail) return detail;
    }

    const text =
      (typeof block.text === "string" && block.text.trim()) ||
      (typeof block.content === "string" && block.content.trim()) ||
      undefined;
    if (!text) continue;

    const parsed = asRecord(tryParseJsonString(text));
    if (parsed && hasErrorShape(parsed)) {
      const detail = extractMcpFailureDetail(parsed, depth + 1);
      if (detail) return detail;
      return text;
    }

    if (allowPlainText) {
      return text;
    }
  }

  return undefined;
}

function extractMcpFailureDetail(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || value === undefined || value === null) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = asRecord(tryParseJsonString(trimmed));
    if (parsed && hasErrorShape(parsed)) {
      return extractMcpFailureDetail(parsed, depth + 1) ?? trimmed;
    }
    return trimmed;
  }

  const record = asRecord(value);
  if (!record) return undefined;

  if (record.error !== undefined) {
    return extractMcpFailureDetail(record.error, depth + 1) ?? formatToolScalar(record.error);
  }

  const isMarkedError =
    record.isError === true ||
    (typeof record.status === "string" && record.status.toLowerCase() === "error");
  if (isMarkedError) {
    if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
    if (typeof record.detail === "string" && record.detail.trim()) return record.detail.trim();
    if (typeof record.text === "string" && record.text.trim()) return record.text.trim();

    const fromContent = extractMcpFailureFromContent(record.content, true, depth + 1);
    if (fromContent) return fromContent;

    return formatToolScalar(record);
  }

  const success = asRecord(record.success);
  if (success) {
    const nestedFailure = extractMcpFailureDetail(success, depth + 1);
    if (nestedFailure) return nestedFailure;

    const wrappedFailure = extractMcpFailureFromContent(success.content, false, depth + 1);
    if (wrappedFailure) return wrappedFailure;
  }

  return extractMcpFailureFromContent(record.content, false, depth + 1);
}

function extractMcpFailureText(record: Record<string, unknown>, toolName?: string): string | undefined {
  const mcp = extractMcpToolCallPayload(record);
  if (!mcp?.result) return undefined;

  const detail = extractMcpFailureDetail(mcp.result);
  if (!detail) return undefined;

  const prefix = toolName ? `MCP ${toolName} failed` : "MCP tool call failed";
  return `${prefix}: ${detail}`;
}

function extractTool(record: Record<string, unknown>): { name?: string; input?: unknown } {
  const mcp = extractMcpToolCallPayload(record);
  if (mcp) {
    return {
      name: mcp.name ?? "mcpToolCall",
      input: mcp.input,
    };
  }

  if (typeof record.name === "string" && record.name.trim()) {
    return {
      name: record.name.trim(),
      input: record.input ?? record.args ?? record.arguments,
    };
  }

  const toolCallWrapper = asRecord(record.tool_call) ?? asRecord(record.toolCall);
  if (toolCallWrapper) {
    for (const [key, value] of Object.entries(toolCallWrapper)) {
      const inner = asRecord(value);
      if (!inner) continue;
      const input = inner.args ?? inner.arguments ?? inner.input;
      if (input !== undefined) {
        return { name: formatCursorToolKey(key), input };
      }
      if (inner.result !== undefined) {
        return { name: formatCursorToolKey(key), input: inner.args ?? inner.arguments ?? inner.input };
      }
    }
  }

  const toolCall = toolCallWrapper ?? record;
  const name =
    (typeof toolCall.name === "string" && toolCall.name) ||
    (typeof toolCall.tool === "string" && toolCall.tool) ||
    (typeof record.function === "string" && record.function) ||
    undefined;
  const input = record.input ?? record.args ?? toolCall.input ?? toolCall.arguments ?? toolCall.args;
  return { name, input };
}

function formatToolScalar(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const json = JSON.stringify(value);
  return json.length > 72 ? `${json.slice(0, 69)}…` : json;
}

const TOOL_SUMMARY_KEYS = [
  "path",
  "command",
  "query",
  "step_id",
  "action",
  "action_name",
  "url",
  "file",
  "pattern",
  "description",
  "toolName",
  "server",
  "name",
  "branch",
  "prompt",
  "old_string",
  "new_string",
  "glob",
  "target_directory",
] as const;

export function summarizeToolInputParts(input?: unknown, limit = 3): ToolInputSummaryPart[] {
  if (input === undefined || input === null) return [];
  const record = asRecord(input);
  if (!record) return [{ key: "value", value: formatToolScalar(input) }];

  const parts: ToolInputSummaryPart[] = [];
  const seen = new Set<string>();

  const pushPart = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (seen.has(key)) return;
    seen.add(key);
    parts.push({ key, value: formatToolScalar(value) });
  };

  for (const key of TOOL_SUMMARY_KEYS) {
    if (!(key in record)) continue;
    pushPart(key, record[key]);
    if (parts.length >= limit) return parts;
  }

  for (const [key, value] of Object.entries(record)) {
    pushPart(key, value);
    if (parts.length >= limit) break;
  }

  return parts;
}

export function summarizeToolInput(input?: unknown): string {
  return summarizeToolInputParts(input, 2)
    .map((part) => `${part.key}=${part.value}`)
    .join(" · ");
}

export function hasToolInput(input?: unknown): boolean {
  if (input === undefined || input === null) return false;
  const record = asRecord(input);
  if (!record) return true;
  return Object.keys(record).length > 0;
}

export function normalizeAgentStreamEvent(raw: unknown): AgentStreamEvent | undefined {
  const record = asRecord(raw);
  if (!record || typeof record.type !== "string") return undefined;

  const type = normalizeEventType(record.type);
  const text = extractText(record);
  const tool = extractTool(record);
  const mcpFailureText = extractMcpFailureText(record, tool.name);

  if (mcpFailureText) {
    return {
      type: "error",
      text: mcpFailureText,
      toolName: tool.name,
      toolInput: tool.input,
      callId: typeof record.call_id === "string" ? record.call_id : undefined,
      subtype: typeof record.subtype === "string" ? record.subtype : undefined,
      raw: record,
    };
  }

  return {
    type,
    text,
    toolName: tool.name,
    toolInput: tool.input,
    callId: typeof record.call_id === "string" ? record.call_id : undefined,
    subtype: typeof record.subtype === "string" ? record.subtype : undefined,
    raw: record,
  };
}

export function parseAgentStreamLines(text: string): AgentStreamEvent[] | undefined {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;

  const events: AgentStreamEvent[] = [];
  for (const line of lines) {
    const parsed = tryParseJsonString(line);
    const event = parsed ? normalizeAgentStreamEvent(parsed) : undefined;
    if (!event || !AGENT_EVENT_TYPES.has(event.type)) return undefined;
    events.push(event);
  }

  return events.length > 0 ? events : undefined;
}

export function parseAgentStreamValue(value: unknown): AgentStreamEvent[] | undefined {
  if (typeof value === "string") return parseAgentStreamLines(value);
  if (!Array.isArray(value)) return undefined;

  const events: AgentStreamEvent[] = [];
  for (const item of value) {
    const event = normalizeAgentStreamEvent(item);
    if (!event || !AGENT_EVENT_TYPES.has(event.type)) return undefined;
    events.push(event);
  }
  return events.length > 0 ? events : undefined;
}

export function coalesceAssistantStream(events: AgentStreamEvent[]): AgentStreamEvent[] {
  const merged: AgentStreamEvent[] = [];
  for (const event of events) {
    const prev = merged[merged.length - 1];
    if (event.type === "assistant" && prev?.type === "assistant" && event.text && prev.text) {
      merged[merged.length - 1] = {
        ...prev,
        text: `${prev.text}${event.text}`,
        raw: event.raw,
      };
      continue;
    }
    merged.push(event);
  }
  return merged;
}

export function compactToolCallStream(events: AgentStreamEvent[]): AgentStreamEvent[] {
  const startedCallIds = new Set(
    events
      .filter((event) => isToolCallEvent(event) && event.subtype === "started" && event.callId)
      .map((event) => event.callId as string),
  );

  return events.filter((event) => {
    if (!isToolCallEvent(event)) return true;
    if (!event.toolName) return false;
    if (event.subtype === "completed" && event.callId && startedCallIds.has(event.callId)) {
      return false;
    }
    return true;
  });
}

function isToolCallEvent(event: AgentStreamEvent): boolean {
  return event.type === "tool" || event.type === "tool_call";
}
