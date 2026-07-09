import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@murrmure/shell-ui";
import { DataTableView } from "./DataTableView.js";
import { buildThinMcpSnippet, type McpSnippetOptions } from "../lib/mcp-config-snippet.js";

export function buildMcpSnippet(opts: McpSnippetOptions): Record<string, unknown> {
  return buildThinMcpSnippet(opts);
}

export function McpSnippetCard({ snippet }: { snippet: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const copyText = JSON.stringify(snippet, null, 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">MCP snippet</CardTitle>
        <CardDescription>Prefilled from your connection values.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DataTableView value={snippet} className="py-1" />
        <Button
          variant="outline"
          size="sm"
          aria-label="Copy MCP config"
          onClick={async () => {
            await navigator.clipboard.writeText(copyText);
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
