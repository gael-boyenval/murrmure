export interface McpSnippetOptions {
  command?: string;
  hubId: string;
  connectionId: string;
}

export function buildThinMcpSnippet(opts: McpSnippetOptions): Record<string, unknown> {
  return {
    mcpServers: {
      murrmure: {
        command: opts.command ?? "murrmure-mcp",
        args: ["--hub", opts.hubId, "--connection", opts.connectionId],
      },
    },
  };
}
