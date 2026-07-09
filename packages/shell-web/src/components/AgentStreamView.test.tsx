/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentStreamView } from "./AgentStreamView.js";
import {
  compactToolCallStream,
  parseAgentStreamLines,
  type AgentStreamEvent,
} from "../lib/parse-agent-stream.js";

function parseEvents(lines: Array<Record<string, unknown>>): AgentStreamEvent[] {
  const parsed = parseAgentStreamLines(lines.map((line) => JSON.stringify(line)).join("\n"));
  expect(parsed).toBeTruthy();
  return parsed ?? [];
}

describe("AgentStreamView", () => {
  test("renders mcpToolCall one-liner with tool name and params", () => {
    const events = parseEvents([
      {
        type: "tool_call",
        subtype: "started",
        call_id: "mcp-call-1",
        tool_call: {
          mcpToolCall: {
            args: {
              toolName: "murrmure_resolve_step",
              args: {
                run_id: "run_123",
                step_id: "build.prepare",
                branch: "completed",
              },
            },
          },
        },
      },
    ]);

    render(<AgentStreamView events={events} />);

    expect(screen.getByText("murrmure_resolve_step")).toBeTruthy();
    expect(screen.getByText("run_id=")).toBeTruthy();
    expect(screen.getByText("run_123")).toBeTruthy();
    expect(screen.getByText("step_id=")).toBeTruthy();
  });

  test("renders MCP completion failures as error blocks", () => {
    const events = compactToolCallStream(
      parseEvents([
        {
          type: "tool_call",
          subtype: "started",
          call_id: "mcp-call-2",
          tool_call: {
            mcpToolCall: {
              args: {
                toolName: "murrmure_wait_for_run",
                args: { run_id: "run_123" },
              },
            },
          },
        },
        {
          type: "tool_call",
          subtype: "completed",
          call_id: "mcp-call-2",
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
        },
      ]),
    );

    render(<AgentStreamView events={events} />);

    const error = screen.getByText((content) => {
      return content.includes("MCP murrmure_wait_for_run failed") && content.includes("Run not found");
    });
    expect(error.className).toContain("text-red-300");
    expect(screen.queryByText(/isError/)).toBeNull();
  });
});
