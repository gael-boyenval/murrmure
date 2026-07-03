import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ViewAppContext } from "@murrmure/view-sdk";
import { AppShell } from "../layout/AppShell.js";
import { ViewCanvasHost, type ViewCanvasFixtureTab } from "../components/ViewCanvasHost.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { getHubBaseUrl, getShellToken } from "../hooks.js";

export function ViewDevPage() {
  const { spaceId, viewId } = useParams();
  const client = useShellClient();
  const [activeFixture, setActiveFixture] = useState<string | undefined>();
  const [fixtureContexts, setFixtureContexts] = useState<Record<string, ViewAppContext>>({});

  const sessionQuery = useQuery({
    queryKey: ["view-dev-session", spaceId],
    queryFn: () => client!.dev.viewSession(spaceId!),
    enabled: Boolean(client && spaceId),
  });

  const session = sessionQuery.data?.session;
  const fixtures = session?.fixtures ?? [];
  const fixtureKey = fixtures.map((f) => f.name).join("\0");
  const initialFixture = activeFixture ?? session?.initial_fixture ?? fixtures[0]?.name;

  useEffect(() => {
    if (!client || !spaceId || !viewId || fixtures.length === 0) return;
    let cancelled = false;

    void (async () => {
      const next: Record<string, ViewAppContext> = {};
      for (const fixture of fixtures) {
        const { context } = await client.dev.viewFixture(spaceId, viewId, fixture.name);
        next[fixture.name] = context as unknown as ViewAppContext;
      }
      if (!cancelled) setFixtureContexts(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [client, spaceId, viewId, fixtureKey]);

  const fixtureTabs: ViewCanvasFixtureTab[] = useMemo(
    () =>
      fixtures
        .filter((f) => fixtureContexts[f.name])
        .map((f) => ({ name: f.name, context: fixtureContexts[f.name]! })),
    [fixtures, fixtureContexts],
  );

  const activeContext = initialFixture ? fixtureContexts[initialFixture] : undefined;
  const hubBase = getHubBaseUrl();
  const token = getShellToken();

  const context: ViewAppContext =
    activeContext ??
    ({
      flow_id: "dev",
      space_id: spaceId ?? "spc_dev",
      hub_base_url: hubBase,
      token,
      gate: { gate_id: "gte_dev", step_id: "review" },
    } satisfies ViewAppContext);

  if (sessionQuery.isLoading) {
    return (
      <AppShell canvasMode>
        <p className="p-6 text-sm text-muted-foreground">Loading view dev session…</p>
      </AppShell>
    );
  }

  if (sessionQuery.isError || !session?.dev_url) {
    return (
      <AppShell canvasMode>
        <p className="p-6 text-sm text-muted-foreground">
          No active view dev session — run <code className="font-mono">mrmr view dev {viewId}</code>{" "}
          from your space root.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell canvasMode>
      <ViewCanvasHost
        title={viewId ?? "View dev"}
        iframeSrc={session.dev_url}
        context={context}
        onSubmit={() => undefined}
        devMode
        fixtureTabs={fixtureTabs}
        activeFixture={initialFixture}
        onFixtureChange={setActiveFixture}
      />
    </AppShell>
  );
}
