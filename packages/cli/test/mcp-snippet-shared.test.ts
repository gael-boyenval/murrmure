import { describe, expect, test } from "vitest";
import { buildMcpConfigSnippet as buildCliSnippet } from "../src/lib/space-doctor-mcp.js";
import { buildMcpConfigSnippet as buildDesktopSnippet } from "../../../apps/desktop/src/menus.js";
import { buildThinMcpSnippet as buildShellWebSnippet } from "../../../packages/shell-web/src/lib/mcp-config-snippet.js";

describe("MCP snippet shared shape", () => {
  test("CLI, Desktop, and Shell Web snippets are identical thin shape", () => {
    const tokenPlaceholder = "tok_<replace_with_grant_token>";
    const cliSnippet = JSON.parse(buildCliSnippet({ token: tokenPlaceholder })) as Record<string, unknown>;
    const desktopSnippet = JSON.parse(buildDesktopSnippet()) as Record<string, unknown>;
    const shellWebSnippet = buildShellWebSnippet({ token: tokenPlaceholder });

    expect(cliSnippet).toEqual(desktopSnippet);
    expect(cliSnippet).toEqual(shellWebSnippet);

    expect(cliSnippet).toMatchInlineSnapshot(`
      {
        "mcpServers": {
          "murrmure": {
            "command": "murrmure-mcp",
            "env": {
              "MURRMURE_HUB_TOKEN": "tok_<replace_with_grant_token>",
            },
          },
        },
      }
    `);
  });
});
