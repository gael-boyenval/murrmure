import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from "@murrmure/shell-ui";
import { AppShell } from "../layout/AppShell.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { setActiveSpaceId } from "../hooks.js";
import { useEffect } from "react";
import { SpaceIndexPanel } from "../components/SpaceIndexPanel.js";
import { EmittableEventsPanel } from "../components/EmittableEventsPanel.js";

function FlowRow({
  flow,
  spaceId,
  onRun,
  running,
}: {
  flow: {
    flow_id: string;
    name: string;
    manual: boolean;
    can_run: boolean;
    can_preview: boolean;
    view_ref?: {
      view_id: string;
      shell_route?: string;
    };
    start?: { requires_view?: string | null };
  };
  spaceId: string;
  onRun: () => void;
  running: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        {flow.can_preview ? (
          <Link
            to={`/spaces/${spaceId}/flows/${flow.flow_id}`}
            className="font-medium hover:underline"
          >
            {flow.name}
          </Link>
        ) : (
          <span className="font-medium">{flow.name}</span>
        )}
        <p className="truncate font-mono text-xs text-muted-foreground">{flow.flow_id}</p>
      </div>
      {flow.can_run && flow.manual ? (
        <Button size="sm" onClick={onRun} disabled={running}>
          Run
        </Button>
      ) : flow.can_preview && !flow.can_run ? (
        <Badge variant="outline">Preview</Badge>
      ) : null}
    </div>
  );
}

function RunRow({ run }: { run: { run_id: string; session_id: string; lifecycle: string; title?: string } }) {
  return (
    <Link
      to={`/sessions/${run.session_id}`}
      className="block border-b border-border py-2 last:border-0 hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm">{run.title ?? run.run_id}</span>
        <Badge variant="outline">{run.lifecycle}</Badge>
      </div>
      <p className="font-mono text-xs text-muted-foreground">{run.run_id}</p>
    </Link>
  );
}

export function SpaceHomePage() {
  const { spaceId } = useParams();
  const client = useShellClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const spaceQuery = useQuery({
    queryKey: ["space", spaceId],
    queryFn: async () => {
      const spaces = await client!.spaces.list();
      return spaces.find((s) => s.space_id === spaceId) ?? { space_id: spaceId! };
    },
    enabled: Boolean(client && spaceId),
  });

  const homeQuery = useQuery({
    queryKey: ["space-home", spaceId],
    queryFn: () => client!.spaces.home(spaceId!),
    enabled: Boolean(client && spaceId),
  });

  const runMutation = useMutation({
    mutationFn: ({ flow_id, input }: { flow_id: string; input: Record<string, unknown> }) =>
      client!.spaces.runFlow(flow_id, { space_id: spaceId, input }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["space-home", spaceId] });
      navigate(`/sessions/${data.session.session_id}`);
    },
  });

  const handleRun = (flow: SpaceHomeFlowRow) => {
    runMutation.mutate({ flow_id: flow.flow_id, input: {} });
  };

  type SpaceHomeFlowRow = NonNullable<typeof homeQuery.data>["your_flows"][number];

  useEffect(() => {
    if (spaceId) setActiveSpaceId(spaceId);
  }, [spaceId]);

  const space = spaceQuery.data;
  const home = homeQuery.data;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {space?.name ?? space?.slug ?? spaceId}
        </h1>

        {homeQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading space home…</p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Space index</CardTitle>
            <CardDescription>Hooks, events, and actions from the last apply</CardDescription>
          </CardHeader>
          <CardContent>
            {home?.index ? (
              <SpaceIndexPanel index={home.index} />
            ) : homeQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading index…</p>
            ) : (
              <p className="text-sm text-muted-foreground">No index data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Events you can trigger</CardTitle>
            <CardDescription>
              Event types other spaces listen for when emitted from here
            </CardDescription>
          </CardHeader>
          <CardContent>
            {home ? (
              <EmittableEventsPanel events={home.emittable_events ?? []} />
            ) : homeQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        {home && home.needs_attention.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Needs your attention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {home.needs_attention.map((item) => (
                <Link
                  key={item.gate_id ?? item.run_id}
                  to={item.session_id ? `/sessions/${item.session_id}` : "#"}
                  className="block text-sm hover:underline"
                >
                  {item.title}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active runs</CardTitle>
          </CardHeader>
          <CardContent>
            {home?.active_runs.length ? (
              home.active_runs.map((run) => <RunRow key={run.run_id} run={run} />)
            ) : (
              <p className="text-sm text-muted-foreground">No active runs</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your flows</CardTitle>
            <CardDescription>Flows authored in this space</CardDescription>
          </CardHeader>
          <CardContent>
            {home?.your_flows.length ? (
              home.your_flows.map((flow) => (
                <FlowRow
                  key={flow.flow_id}
                  flow={flow}
                  spaceId={spaceId!}
                  onRun={() => handleRun(flow)}
                  running={runMutation.isPending}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No flows indexed — run <code className="font-mono">mrmr space apply</code>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available to run</CardTitle>
          </CardHeader>
          <CardContent>
            {home?.available_to_run.length ? (
              home.available_to_run.map((flow) => (
                <FlowRow
                  key={flow.flow_id}
                  flow={flow}
                  spaceId={spaceId!}
                  onRun={() => handleRun(flow)}
                  running={runMutation.isPending}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No runnable flows</p>
            )}
          </CardContent>
        </Card>

        {home && home.receiving_from.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receiving from</CardTitle>
              <CardDescription>Flows whose steps invoke this space</CardDescription>
            </CardHeader>
            <CardContent>
              {home.receiving_from.map((flow) => (
                <FlowRow
                  key={flow.flow_id}
                  flow={flow}
                  spaceId={spaceId!}
                  onRun={() => handleRun(flow)}
                  running={runMutation.isPending}
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
            {home?.recent_completed.length ? (
              home.recent_completed.map((run) => <RunRow key={run.run_id} run={run} />)
            ) : (
              <p className="text-sm text-muted-foreground">No recent runs</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
