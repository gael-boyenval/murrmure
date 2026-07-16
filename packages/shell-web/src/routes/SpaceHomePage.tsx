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
import { DismissRunButton } from "../components/DismissRunButton.js";
import { DeleteSpaceButton } from "../components/DeleteSpaceButton.js";

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
    authored_here: boolean;
    origin_space_id: string;
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
            to={`/spaces/${spaceId}/flows/${flow.flow_id}?origin_space_id=${encodeURIComponent(flow.origin_space_id)}`}
            className="font-medium hover:underline"
          >
            {flow.name}
          </Link>
        ) : (
          <span className="font-medium">{flow.name}</span>
        )}
        <p className="truncate font-mono text-xs text-muted-foreground">{flow.flow_id}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {flow.authored_here ? <Badge variant="outline">Authored here</Badge> : null}
          {flow.can_run && flow.manual ? <Badge variant="outline">Runnable</Badge> : null}
          {flow.can_preview && !flow.can_run ? <Badge variant="outline">Preview only</Badge> : null}
        </div>
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

function RunRow({
  run,
  spaceId,
  showDismiss,
  onDismissed,
}: {
  run: { run_id: string; session_id: string; lifecycle: string; title?: string };
  spaceId?: string;
  showDismiss?: boolean;
  onDismissed?: () => void | Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border py-2 last:border-0">
      <Link
        to={`/sessions/${run.session_id}`}
        className="min-w-0 flex-1 hover:bg-muted/40"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm">{run.title ?? run.run_id}</span>
          <Badge variant="outline">{run.lifecycle}</Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{run.run_id}</p>
      </Link>
      {showDismiss ? (
        <DismissRunButton
          runId={run.run_id}
          spaceId={spaceId}
          lifecycle={run.lifecycle}
          onDismissed={onDismissed}
        />
      ) : null}
    </div>
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
    mutationFn: ({
      flow_id,
      origin_space_id,
      input,
    }: {
      flow_id: string;
      origin_space_id: string;
      input: Record<string, unknown>;
    }) =>
      client!.spaces.runFlow(flow_id, { space_id: origin_space_id, input }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["space-home", spaceId] });
      navigate(`/sessions/${data.session.session_id}`);
    },
  });

  type SpaceHomeFlowRow = NonNullable<typeof homeQuery.data>["flows"][number];

  const handleRun = (flow: SpaceHomeFlowRow) => {
    runMutation.mutate({
      flow_id: flow.flow_id,
      origin_space_id: flow.origin_space_id,
      input: {},
    });
  };

  useEffect(() => {
    if (spaceId) setActiveSpaceId(spaceId);
  }, [spaceId]);

  const space = spaceQuery.data;
  const home = homeQuery.data;

  return (
    <AppShell>
      <div className="mx-auto w-full min-w-2xl max-w-2xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {space?.name ?? space?.slug ?? spaceId}
          </h1>
          {spaceId ? (
            <DeleteSpaceButton
              spaceId={spaceId}
              spaceLabel={space?.name ?? space?.slug ?? spaceId}
            />
          ) : null}
        </div>

        {homeQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading space home…</p>
        )}

        {home && home.needs_attention.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Needs your attention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {home.needs_attention.map((item) => (
                <Link
                  key={item.gate_id ?? item.step_id ?? item.run_id}
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
              home.active_runs.map((run) => (
                <RunRow
                  key={run.run_id}
                  run={run}
                  spaceId={spaceId}
                  showDismiss
                  onDismissed={() => queryClient.invalidateQueries({ queryKey: ["space-home", spaceId] })}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No active runs</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flows</CardTitle>
            <CardDescription>Authorized flows available in this space</CardDescription>
          </CardHeader>
          <CardContent>
            {home?.flows.length ? (
              home.flows.map((flow) => (
                <FlowRow
                  key={`${flow.origin_space_id}:${flow.flow_id}`}
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

        {home && home.receiving_from.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receiving from</CardTitle>
              <CardDescription>Flows whose steps invoke this space</CardDescription>
            </CardHeader>
            <CardContent>
              {home.receiving_from.map((flow) => (
                <FlowRow
                  key={`${flow.origin_space_id}:${flow.flow_id}`}
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
              <div
                className="scrollbar-subtle max-h-80 overflow-y-auto pr-1"
                aria-label="Recent completed runs"
              >
                {home.recent_completed.map((run) => <RunRow key={run.run_id} run={run} />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent runs</p>
            )}
            <Link
              to={`/spaces/${spaceId}/runs`}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              View all runs
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
