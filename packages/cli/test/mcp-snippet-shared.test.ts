import { describe, expect, test } from "vitest";
import { buildMcpConfigSnippet as buildCliSnippet } from "../src/lib/space-doctor-mcp.js";
import { buildMcpConfigSnippet as buildDesktopSnippet } from "../../../apps/desktop/src/menus.js";
import { buildThinMcpSnippet as buildShellWebSnippet } from "../../../packages/shell-web/src/lib/mcp-config-snippet.js";

describe("MCP snippet shared shape", () => {
  test("CLI, Desktop, and Shell Web snippets are identical thin shape", () => {
    const options = {
      command: "/Users/test/.murrmure/bin/murrmure-mcp",
      hubId: "http://127.0.0.1:8787",
      connectionId: "con_test",
    };
    const cliSnippet = JSON.parse(buildCliSnippet(options)) as Record<string, unknown>;
    const desktopSnippet = JSON.parse(buildDesktopSnippet(options)) as Record<string, unknown>;
    const shellWebSnippet = buildShellWebSnippet(options);

    expect(cliSnippet).toEqual(desktopSnippet);
    expect(cliSnippet).toEqual(shellWebSnippet);

    expect(cliSnippet).toMatchInlineSnapshot(`
      {
        "mcpServers": {
          "murrmure": {
            "args": [
              "--hub",
              "http://127.0.0.1:8787",
              "--connection",
              "con_test",
            ],
            "command": "/Users/test/.murrmure/bin/murrmure-mcp",
          },
        },
      }
    `);
  });
});
