import { describe, expect, test } from "vitest";
import { buildMcpSnippet } from "./McpSnippetCard.js";

describe("McpSnippetCard", () => {
  test("buildMcpSnippet returns thin murrmure-mcp config shape", () => {
    const snippet = buildMcpSnippet({
      hubId: "http://127.0.0.1:8787",
      connectionId: "con_test",
    });

    expect(snippet).toEqual({
      mcpServers: {
        murrmure: {
          command: "murrmure-mcp",
          args: [
            "--hub",
            "http://127.0.0.1:8787",
            "--connection",
            "con_test",
          ],
        },
      },
    });

    const serialized = JSON.stringify(snippet);
    expect(serialized).not.toContain("MURRMURE_HUB_URL");
    expect(serialized).not.toContain("MURRMURE_SPACE_ID");
  });

  test("buildMcpSnippet supports the stable launcher command", () => {
    const snippet = buildMcpSnippet({
      command: "/Users/test/.murrmure/bin/murrmure-mcp",
      hubId: "http://127.0.0.1:8787",
      connectionId: "con_test",
    });
    expect(snippet).toEqual({
      mcpServers: {
        murrmure: {
          command: "/Users/test/.murrmure/bin/murrmure-mcp",
          args: [
            "--hub",
            "http://127.0.0.1:8787",
            "--connection",
            "con_test",
          ],
        },
      },
    });
  });
});
