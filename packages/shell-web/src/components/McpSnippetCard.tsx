import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@murrmure/shell-ui";

export function buildMcpSnippet(opts: {
  hubUrl: string;
  token?: string;
  spaceId?: string;
}): string {
  return JSON.stringify(
    {
      mcpServers: {
        murrmure: {
          command: "murrmure",
          args: ["mcp"],
          env: {
            MURRMURE_HUB_URL: opts.hubUrl,
            MURRMURE_HUB_TOKEN: opts.token || "tok_…",
            MURRMURE_SPACE_ID: opts.spaceId || "spc_…",
          },
        },
      },
    },
    null,
    2,
  );
}

export function McpSnippetCard({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">MCP snippet</CardTitle>
        <CardDescription>Prefilled from your connection values.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">{snippet}</pre>
        <Button
          variant="outline"
          size="sm"
          aria-label="Copy MCP config"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy MCP config"}
        </Button>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {copied ? "MCP config copied to clipboard" : ""}
        </span>
      </CardContent>
    </Card>
  );
}
