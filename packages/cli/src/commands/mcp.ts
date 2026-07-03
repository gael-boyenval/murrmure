import { defineCommand, type CommandDef } from "citty";
import { startMcpServer } from "../mcp/main.js";

export const mcpCommand = defineCommand({
  meta: {
    name: "mcp",
    description:
      "Start MCP stdio server for Cursor/Claude (Requires: MURRMURE_HUB_TOKEN, MURRMURE_SPACE_ID)",
  },
  args: {},
  async run() {
    await startMcpServer();
  },
}) as CommandDef;
