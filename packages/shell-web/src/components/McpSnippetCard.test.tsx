import { describe, expect, test } from "vitest";
import { buildMcpSnippet } from "./McpSnippetCard.js";

describe("McpSnippetCard", () => {
  test("buildMcpSnippet returns thin murrmure-mcp config shape", () => {
    const snippet = buildMcpSnippet({ token: "tok_test_123" });

    expect(snippet).toEqual({
      mcpServers: {
        murrmure: {
          command: "murrmure-mcp",
          env: {
            MURRMURE_HUB_TOKEN: "tok_test_123",
          },
        },
      },
    });

    const serialized = JSON.stringify(snippet);
    expect(serialized).not.toContain("MURRMURE_HUB_URL");
    expect(serialized).not.toContain("MURRMURE_SPACE_ID");
  });

  test("buildMcpSnippet falls back to token placeholder", () => {
    const snippet = buildMcpSnippet({});
    expect(snippet).toEqual({
      mcpServers: {
        murrmure: {
          command: "murrmure-mcp",
          env: {
            MURRMURE_HUB_TOKEN: "tok_<replace_with_grant_token>",
          },
        },
      },
    });
  });
});
