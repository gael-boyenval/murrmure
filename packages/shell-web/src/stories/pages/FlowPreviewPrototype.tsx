import { Badge, Card, CardContent, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { PrototypeShell } from "../prototype-shell.js";
import { flowPreviewMeta, flowPreviewSteps } from "../prototype-data.js";

function startModeLabel(start: { manual?: boolean }): string {
  if (start.manual) return "Manual start";
  return "Triggered";
}

export function FlowPreviewPrototype() {
  const { start } = flowPreviewMeta;

  return (
    <PrototypeShell activePath="/spaces/spc_demo/flows/flw_review_loop">
      <div className="mx-auto max-w-2xl space-y-4">
        <span className="text-sm text-muted-foreground">← Back to space</span>
        <h1 className="text-2xl font-semibold">{flowPreviewMeta.name}</h1>
        <p className="font-mono text-xs text-muted-foreground">{flowPreviewMeta.digest}</p>

        <div className="space-y-2 rounded-md border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">{flowPreviewMeta.description}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{flowPreviewMeta.spaceName}</Badge>
            <Badge variant="outline">{startModeLabel(start)}</Badge>
            {start.view_binding ? (
              <Badge variant="secondary">View binding: {start.view_binding}</Badge>
            ) : null}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {flowPreviewSteps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-2 border-b border-border py-2 last:border-0">
                <span className="text-muted-foreground">{i + 1}.</span>
                <Badge variant="outline">{step.kind}</Badge>
                <span className="font-mono text-sm">{step.id}</span>
                {step.invoke ? (
                  <span className="text-xs text-muted-foreground">
                    {step.invoke.action} @ {step.invoke.space}
                  </span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PrototypeShell>
  );
}
