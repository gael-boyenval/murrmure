import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CreateReviewSessionInputShape,
  GetSessionInputShape,
  WaitForReviewInputShape,
  type View,
} from "@studio/review-contracts";
import { daemonBaseUrl, fixtureUrl, webBaseUrl } from "../config";

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Thin stdio MCP proxy. Each tool is a stateless `fetch()` to the daemon HTTP
 * API (the "thin MCP, fat daemon" pattern). US-001 ships three tools.
 */
export async function runMcp(): Promise<void> {
  const base = daemonBaseUrl();
  const server = new McpServer({ name: "studio", version: "0.1.0" });

  server.registerTool(
    "get_session",
    {
      title: "Get review session",
      description:
        "Read a Studio review session (session.json). Omit session_key for the most recent session.",
      inputSchema: GetSessionInputShape,
    },
    async ({ session_key }) => {
      const path = session_key
        ? `/api/sessions/${session_key}`
        : await activeSessionPath(base);
      if (!path) return textResult({ error: "No sessions found." });
      const response = await fetch(base + path);
      if (!response.ok) {
        return textResult({ error: `get_session failed: ${response.status}` });
      }
      return textResult(await response.json());
    },
  );

  server.registerTool(
    "create_review_session",
    {
      title: "Create review session",
      description:
        "Open a new review session and return the Studio URL for the human. Call this before wait_for_review so the reviewer opens the correct tab.",
      inputSchema: CreateReviewSessionInputShape,
    },
    async ({ view, url }) => {
      const response = await fetch(`${base}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          view: (view ?? "app") as View,
          url: url ?? fixtureUrl(),
        }),
      });
      if (!response.ok) {
        return textResult({ error: `Failed to create session: ${response.status}` });
      }
      const session = (await response.json()) as {
        session_key: string;
        round_state: string;
        review_round: number;
      };
      const studioUrl = `${webBaseUrl()}/sessions/${session.session_key}`;
      console.error(`Studio is open at ${studioUrl}`);
      console.error('Leave comments in the browser, then click "Finish Review".');
      return textResult({
        session_key: session.session_key,
        studio_url: studioUrl,
        round_state: session.round_state,
        review_round: session.review_round,
      });
    },
  );

  server.registerTool(
    "wait_for_review",
    {
      title: "Wait for human review",
      description:
        "Block until the human clicks Finish Review, then return the structured result. Requires session_key — create one with create_review_session first.",
      inputSchema: WaitForReviewInputShape,
    },
    async ({ session_key, view, url }) => {
      let key = session_key;
      if (!key) {
        // Back-compat: auto-create when omitted, but prefer create_review_session.
        const created = await fetch(`${base}/api/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            view: (view ?? "app") as View,
            url: url ?? fixtureUrl(),
          }),
        });
        if (!created.ok) {
          return textResult({ error: `Failed to create session: ${created.status}` });
        }
        key = ((await created.json()) as { session_key: string }).session_key;
      }

      console.error(`Studio is open at ${webBaseUrl()}/sessions/${key}`);
      console.error('Leave comments in the browser, then click "Finish Review".');

      // Resilient long-poll mirroring the CLI.
      while (true) {
        let data: { status: string } & Record<string, unknown>;
        try {
          const response = await fetch(`${base}/api/sessions/${key}/review-cycle`, {
            method: "POST",
          });
          data = (await response.json()) as typeof data;
        } catch {
          continue;
        }
        if (data.status === "timeout") continue;
        return textResult(data);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function activeSessionPath(base: string): Promise<string | null> {
  try {
    const response = await fetch(`${base}/api/sessions`);
    const summaries = (await response.json()) as Array<{ session_key: string }>;
    if (summaries.length === 0) return null;
    return `/api/sessions/${summaries[0].session_key}`;
  } catch {
    return null;
  }
}
