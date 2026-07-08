import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@murrmure/shell-ui";
import { AppShell } from "../layout/AppShell.js";
import { getStoredHubUrl, isBundledShell, setStorageItem } from "../hooks.js";

export function ConnectPage() {
  const bundled = isBundledShell();
  const navigate = useNavigate();
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  const [token, setToken] = useState(() => localStorage.getItem("murrmure_token") ?? "");

  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        murrmure: {
          command: "murrmure",
          args: ["mcp"],
          env: {
            MURRMURE_HUB_URL: bundled ? window.location.origin : hubUrl,
            MURRMURE_HUB_TOKEN: token || "tok_…",
            MURRMURE_SPACE_ID: "spc_…",
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connect agent</h1>
          <CardDescription className="mt-2">
            Paste your hub URL and minted grant token. Grants are created with{" "}
            <code className="text-sm">mrmr grant mint</code>.
          </CardDescription>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hub connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!bundled && (
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Hub URL</span>
                <input
                  className="w-full rounded-md border border-border bg-muted px-3 py-2"
                  value={hubUrl}
                  onChange={(e) => setHubUrl(e.target.value)}
                />
              </label>
            )}
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Grant token</span>
              <input
                className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="tok_…"
              />
            </label>
            <Button
              onClick={() => {
                setStorageItem("murrmure_hub_url", bundled ? window.location.origin : hubUrl);
                setStorageItem("murrmure_token", token);
                navigate("/spaces/new");
              }}
            >
              Save & continue
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">MCP snippet</CardTitle>
            <CardDescription>Prefilled from your connection values.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
              {mcpSnippet}
            </pre>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
