import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { VIEW_TRANSPORT_VERSION, type ViewAppContext, type ViewContractError } from "@murrmure/view-sdk";
import { AppShell } from "../layout/AppShell.js";
import { ViewCanvasHost, type ViewCanvasFixtureTab } from "../components/ViewCanvasHost.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { getHubBaseUrl } from "../hooks.js";

type Ack = { ok: true } | { ok: false; error: ViewContractError };

export function ViewDevPage() {
  const { spaceId, viewId } = useParams();
  const client = useShellClient();
  const [activeFixture, setActiveFixture] = useState<string | undefined>();
  const [fixtureContexts, setFixtureContexts] = useState<Record<string, ViewAppContext>>({});
  const [nonce] = useState(() => globalThis.crypto?.randomUUID?.() ?? `nonce-${Date.now()}`);

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

  // Runtime base carries the real hub origin (so the child's origin check passes)
  // and a fresh per-mount nonce (so the host↔view binding is unique). Dev fixtures
  // only contribute the projected contract (step/input/steps) and a cosmetic
  // flow_id — never hub_base_url or nonce — so they stay partial and portable.
  const baseContext: ViewAppContext = {
    flow_id: "dev",
    space_id: spaceId ?? "spc_dev",
    hub_base_url: hubBase,
    mode: "dev",
    transport_version: VIEW_TRANSPORT_VERSION,
    nonce,
    step: { step_id: "review", branches: [{ branch: "validated" }] },
  };

  const context: ViewAppContext = activeContext
    ? {
        ...baseContext,
        flow_id: activeContext.flow_id ?? baseContext.flow_id,
        step: activeContext.step ?? baseContext.step,
        ...(activeContext.input ? { input: activeContext.input } : {}),
        ...(activeContext.steps ? { steps: activeContext.steps } : {}),
        nonce,
      }
    : baseContext;

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
        onSubmitBranch={async () => ({ ok: true } satisfies Ack)}
        onCancel={async () => ({ ok: true } satisfies Ack)}
        devMode
        fixtureTabs={fixtureTabs}
        activeFixture={initialFixture}
        onFixtureChange={setActiveFixture}
      />
    </AppShell>
  );
}
