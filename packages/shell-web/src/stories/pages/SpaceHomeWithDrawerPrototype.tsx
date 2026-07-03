import { fn } from "@storybook/test";
import { useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { ViewDrawer } from "../../components/ViewDrawer.js";
import { PrototypeShell } from "../prototype-shell.js";
import { activeRuns, demoFlows } from "../prototype-data.js";

export function SpaceHomeWithDrawerPrototype() {
  const [open, setOpen] = useState(true);
  const flow = demoFlows[0]!;

  return (
    <PrototypeShell activePath="/spaces/spc_demo">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Demo space</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your flows</CardTitle>
            <CardDescription>Flows authored in this space</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2 border-b border-border py-2">
              <div>
                <span className="font-medium">{flow.name}</span>
                <p className="font-mono text-xs text-muted-foreground">{flow.flow_id}</p>
              </div>
              <Button size="sm" onClick={() => setOpen(true)}>
                Run
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active runs</CardTitle>
          </CardHeader>
          <CardContent>
            {activeRuns.slice(0, 1).map((run) => (
              <div key={run.run_id} className="py-2 text-sm">
                {run.title}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ViewDrawer
        open={open}
        flow={flow}
        spaceId="spc_demo"
        onClose={() => setOpen(false)}
        onSubmit={fn()}
      />
    </PrototypeShell>
  );
}
