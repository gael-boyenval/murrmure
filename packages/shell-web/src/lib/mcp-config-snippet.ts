export interface McpSnippetOptions {
  token?: string;
}

export function buildThinMcpSnippet(opts: McpSnippetOptions): Record<string, unknown> {
  return {
    mcpServers: {
      murrmure: {
        command: "murrmure-mcp",
        env: {
          MURRMURE_HUB_TOKEN: opts.token || "tok_<replace_with_grant_token>",
        },
      },
    },
  };
}
