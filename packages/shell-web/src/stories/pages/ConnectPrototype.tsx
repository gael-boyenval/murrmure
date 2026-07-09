import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@murrmure/shell-ui";
import { buildMcpSnippet, McpSnippetCard } from "../../components/McpSnippetCard.js";
import { PrototypeShell } from "../prototype-shell.js";

const HUB_URL = "http://127.0.0.1:8787";
const mcpSnippet = buildMcpSnippet({});

export function ConnectPrototype() {
  return (
    <PrototypeShell activePath="/connect" spaces={[]} headerVariant="disconnected">
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
            <div className="space-y-1">
              <Label htmlFor="hub-url">Hub URL</Label>
              <Input id="hub-url" defaultValue={HUB_URL} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="token">Grant token</Label>
              <Input id="token" className="font-mono" placeholder="tok_…" />
            </div>
            <Button>Save & continue</Button>
          </CardContent>
        </Card>

        <McpSnippetCard snippet={mcpSnippet} />
      </div>
    </PrototypeShell>
  );
}
