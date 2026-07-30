export interface McpSnippetOptions {
  command?: string;
  /** @deprecated Ignored. Hub is resolved from Desktop discovery. */
  hubId?: string;
  /** Connection id to pin in MCP args (required for space-correct local tools). */
  connectionId?: string;
}

export function buildThinMcpSnippet(opts: McpSnippetOptions = {}): Record<string, unknown> {
  const connectionId = opts.connectionId?.trim();
  return {
    mcpServers: {
      murrmure: {
        command: opts.command ?? "murrmure-mcp",
        ...(connectionId?.startsWith("con_")
          ? { args: ["--connection", connectionId] }
          : {}),
      },
    },
  };
}
