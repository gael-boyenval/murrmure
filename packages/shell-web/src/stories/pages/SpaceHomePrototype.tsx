import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@murrmure/shell-ui";
import { PrototypeShell } from "../prototype-shell.js";
import {
  activeRuns,
  attentionItems,
  availableToRun,
  completedRuns,
  demoFlows,
  receivingFrom,
} from "../prototype-data.js";

function FlowRow({
  name,
  flowId,
  action,
}: {
  name: string;
  flowId: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <span className="font-medium">{name}</span>
        <p className="truncate font-mono text-xs text-muted-foreground">{flowId}</p>
      </div>
      {action}
    </div>
  );
}

function flowAction(flow: { can_run: boolean; can_preview: boolean; manual: boolean }) {
  if (flow.can_run && flow.manual) {
    return <Button size="sm">Run</Button>;
  }
  if (flow.can_preview) {
    return <Badge variant="outline">Preview</Badge>;
  }
  return null;
}

function RunRow({ title, runId, lifecycle }: { title: string; runId: string; lifecycle: string }) {
  return (
    <div className="block border-b border-border py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm">{title}</span>
        <Badge variant="outline">{lifecycle}</Badge>
      </div>
      <p className="font-mono text-xs text-muted-foreground">{runId}</p>
    </div>
  );
}

export type SpaceHomePrototypeState = "empty" | "active" | "attention";

function AttentionRow({ title, kind }: { title: string; kind: "gate" | "run_failed" | "human_step" }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-amber-900/40 py-2 last:border-0">
      <p className="text-sm hover:underline">{title}</p>
      <Badge variant={kind === "gate" ? "warning" : "outline"} className="shrink-0">
        {kind === "gate" ? "Approval needed" : "Failed"}
      </Badge>
    </div>
  );
}

function EmptyFlowsHint() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">No flows indexed yet.</p>
      <p className="text-sm text-muted-foreground">
        Flows appear after <code className="font-mono">mrmr space apply</code> indexes this directory.
      </p>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-sm">
        mrmr space apply
      </pre>
    </div>
  );
}

export function SpaceHomePrototype({ state }: { state: SpaceHomePrototypeState }) {
  const isEmpty = state === "empty";
  const showAttention = state === "attention";

  return (
    <PrototypeShell activePath="/spaces/spc_demo">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Demo space</h1>

        {showAttention && (
          <Card className="border-amber-800/60 bg-amber-950/20">
            <CardHeader className="border-b border-amber-900/40 pb-3">
              <CardTitle className="text-base text-amber-200">
                Needs your attention ({attentionItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 pt-3">
              {attentionItems.map((item) => (
                <AttentionRow key={item.gate_id ?? item.run_id} title={item.title} kind={item.kind} />
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active runs</CardTitle>
          </CardHeader>
          <CardContent>
            {isEmpty ? (
              <p className="text-sm text-muted-foreground">No active runs</p>
            ) : (
              activeRuns.map((run) => (
                <RunRow key={run.run_id} title={run.title ?? run.run_id} runId={run.run_id} lifecycle={run.lifecycle} />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flows</CardTitle>
            <CardDescription>Authorized flows available in this space</CardDescription>
          </CardHeader>
          <CardContent>
            {isEmpty ? (
              <EmptyFlowsHint />
            ) : (
              [...demoFlows, ...availableToRun].map((flow) => (
                <FlowRow
                  key={flow.flow_id}
                  name={flow.name}
                  flowId={flow.flow_id}
                  action={flowAction(flow)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {!isEmpty && receivingFrom.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receiving from</CardTitle>
              <CardDescription>Flows whose steps invoke this space</CardDescription>
            </CardHeader>
            <CardContent>
              {receivingFrom.map((flow) => (
                <FlowRow
                  key={flow.flow_id}
                  name={flow.name}
                  flowId={flow.flow_id}
                  action={flowAction(flow)}
                />
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent completed</CardTitle>
          </CardHeader>
          <CardContent>
            {isEmpty ? (
              <p className="text-sm text-muted-foreground">No recent runs</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {completedRuns.map((run) => (
                  <RunRow key={run.run_id} title={run.title ?? run.run_id} runId={run.run_id} lifecycle={run.lifecycle} />
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="mt-3">View all runs</Button>
          </CardContent>
        </Card>
      </div>
    </PrototypeShell>
  );
}
