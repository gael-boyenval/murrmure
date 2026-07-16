import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Button } from "@murrmure/shell-ui";
import { AppShell } from "../layout/AppShell.js";
import { useShellClient } from "../providers/ShellClientProvider.js";

function CliBlock({ title, command }: { title: string; command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-sm">{command}</pre>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function SpacesNewPage() {
  const client = useShellClient();
  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => client!.spaces.list(),
    enabled: Boolean(client),
    refetchInterval: false,
  });

  const waiting = Boolean(client) && (spacesQuery.isFetching || spacesQuery.data?.length === 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your first space</h1>
          <CardDescription className="mt-2">
            Fresh storage is empty. Run setup in your project directory, confirm
            its name and slug, then watch the sidebar update live.
          </CardDescription>
        </div>

        {waiting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for space via SSE…
          </div>
        )}

        <CliBlock
          title="Guided setup"
          command="mrmr setup"
        />
        <CliBlock
          title="Offline scaffold only"
          command="mrmr space init"
        />
        <CliBlock
          title="Granular link and apply"
          command={"mrmr space link --create\nmrmr space apply"}
        />

        {spacesQuery.data && spacesQuery.data.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {spacesQuery.data.map((s) => (
              <Badge key={s.space_id} variant="success">
                {s.name ?? s.space_id}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
