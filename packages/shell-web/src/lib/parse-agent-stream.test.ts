import { describe, expect, test } from "vitest";
import {
  coalesceAssistantStream,
  compactToolCallStream,
  normalizeAgentStreamEvent,
  parseAgentStreamLines,
  summarizeToolInput,
  summarizeToolInputParts,
} from "./parse-agent-stream.js";

describe("parse-agent-stream", () => {
  test("parseAgentStreamLines reads NDJSON assistant and tool events", () => {
    const events = parseAgentStreamLines(
      '{"type":"assistant","text":"Hello"}\n{"type":"tool","name":"Read","input":{"path":"a.md"}}\n',
    );
    expect(events?.map((e) => e.type)).toEqual(["assistant", "tool"]);
    expect(events?.[0]?.text).toBe("Hello");
    expect(events?.[1]?.toolName).toBe("Read");
    expect(events?.[1]?.toolInput).toEqual({ path: "a.md" });
  });

  test("normalizeAgentStreamEvent extracts Cursor tool_call started events", () => {
    const event = normalizeAgentStreamEvent({
      type: "tool_call",
      subtype: "started",
      call_id: "call-1",
      tool_call: {
        readToolCall: {
          args: { path: "specs/current/feature.md" },
        },
      },
    });
    expect(event?.type).toBe("tool_call");
    expect(event?.toolName).toBe("Read");
    expect(event?.toolInput).toEqual({ path: "specs/current/feature.md" });
    expect(event?.callId).toBe("call-1");
    expect(event?.subtype).toBe("started");
  });

  test("normalizeAgentStreamEvent extracts mcpToolCall name and nested args", () => {
    const event = normalizeAgentStreamEvent({
      type: "tool_call",
      subtype: "started",
      call_id: "mcp-call-1",
      tool_call: {
        mcpToolCall: {
          args: {
            toolName: "murrmure_resolve_step",
            args: {
              run_id: "run_123",
              step_id: "build.step",
              branch: "completed",
            },
          },
        },
      },
    });
    expect(event?.type).toBe("tool_call");
    expect(event?.toolName).toBe("murrmure_resolve_step");
    expect(event?.toolInput).toEqual({
      run_id: "run_123",
      step_id: "build.step",
      branch: "completed",
    });
  });

  test("normalizeAgentStreamEvent turns MCP result errors into error events", () => {
    const event = normalizeAgentStreamEvent({
      type: "tool_call",
      subtype: "completed",
      call_id: "mcp-call-2",
      tool_call: {
        mcpToolCall: {
          args: {
            toolName: "murrmure_resolve_step",
            args: {},
          },
          result: {
            error: {
              message: "run_id, step_id, and branch are required",
            },
          },
        },
      },
    });

    expect(event?.type).toBe("error");
    expect(event?.text).toContain("MCP murrmure_resolve_step failed");
    expect(event?.text).toContain("run_id, step_id, and branch are required");
  });

  test("normalizeAgentStreamEvent catches success-wrapped MCP errors", () => {
    const event = normalizeAgentStreamEvent({
      type: "tool_call",
      subtype: "completed",
      call_id: "mcp-call-3",
      tool_call: {
        mcpToolCall: {
          args: {
            toolName: "murrmure_wait_for_run",
            args: { run_id: "run_123" },
          },
          result: {
            success: {
              content: [
                {
                  type: "text",
                  text: '{"isError":true,"error":{"message":"Run not found"}}',
                },
              ],
            },
          },
        },
      },
    });

    expect(event?.type).toBe("error");
    expect(event?.text).toContain("MCP murrmure_wait_for_run failed");
    expect(event?.text).toContain("Run not found");
  });

  test("compactToolCallStream drops completed events when started exists", () => {
    const compacted = compactToolCallStream([
      {
        type: "tool_call",
        subtype: "started",
        callId: "call-1",
        toolName: "Read",
        toolInput: { path: "a.md" },
        raw: {},
      },
      {
        type: "tool_call",
        subtype: "completed",
        callId: "call-1",
        toolName: "Read",
        raw: {},
      },
    ]);
    expect(compacted).toHaveLength(1);
    expect(compacted[0]?.subtype).toBe("started");
    expect(compacted[0]?.toolInput).toEqual({ path: "a.md" });
  });

  test("normalizeAgentStreamEvent extracts nested message content", () => {
    const event = normalizeAgentStreamEvent({
      type: "assistant",
      message: { content: [{ type: "text", text: "Nested reply" }] },
    });
    expect(event?.text).toBe("Nested reply");
  });

  test("coalesceAssistantStream merges consecutive assistant chunks", () => {
    const merged = coalesceAssistantStream([
      { type: "assistant", text: "Hel", raw: { type: "assistant", text: "Hel" } },
      { type: "assistant", text: "lo", raw: { type: "assistant", text: "lo" } },
      { type: "tool", toolName: "Bash", raw: { type: "tool", name: "Bash" } },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.text).toBe("Hello");
    expect(merged[1]?.toolName).toBe("Bash");
  });

  test("summarizeToolInput prefers path and step_id for one-line display", () => {
    expect(summarizeToolInput({ path: "specs/current/feature.md" })).toBe("path=specs/current/feature.md");
    expect(summarizeToolInput({ step_id: "build.build-loop", branch: "completed" })).toBe(
      "step_id=build.build-loop · branch=completed",
    );
    expect(summarizeToolInput({ command: "npm test" })).toBe("command=npm test");
  });

  test("summarizeToolInputParts returns labeled param glimpses", () => {
    expect(summarizeToolInputParts({ path: "a.md", command: "npm test" })).toEqual([
      { key: "path", value: "a.md" },
      { key: "command", value: "npm test" },
    ]);
  });
});
