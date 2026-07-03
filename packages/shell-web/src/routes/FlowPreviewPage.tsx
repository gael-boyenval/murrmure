import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@murrmure/shell-ui";
import { AppShell } from "../layout/AppShell.js";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function FlowPreviewPage() {
  const { spaceId, flowId } = useParams();
  const client = useShellClient();

  const previewQuery = useQuery({
    queryKey: ["flow-preview", spaceId, flowId],
    queryFn: () => client!.spaces.flowPreview(spaceId!, flowId!),
    enabled: Boolean(client && spaceId && flowId),
  });

  const preview = previewQuery.data;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to={`/spaces/${spaceId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to space
        </Link>
        <h1 className="text-2xl font-semibold">{preview?.name ?? flowId}</h1>
        <p className="font-mono text-xs text-muted-foreground">{preview?.digest}</p>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {preview?.steps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-2 border-b border-border py-2 last:border-0">
                <span className="text-muted-foreground">{i + 1}.</span>
                <Badge variant="outline">{step.kind}</Badge>
                <span className="font-mono text-sm">{step.id}</span>
                {step.invoke && (
                  <span className="text-xs text-muted-foreground">
                    {step.invoke.action} @ {step.invoke.space}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
