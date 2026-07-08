import { Navigate, Route, Routes } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isBundledShell, getStorageItem } from "./hooks.js";
import { ConnectPage } from "./routes/ConnectPage.js";
import { SpacesNewPage } from "./routes/SpacesNewPage.js";
import { SpaceHomePage } from "./routes/SpaceHomePage.js";
import { FlowPreviewPage } from "./routes/FlowPreviewPage.js";
import { NotificationsPage } from "./routes/NotificationsPage.js";
import { LogsExplorerPage } from "./routes/LogsExplorerPage.js";
import { RunPage } from "./routes/RunPage.js";
import { SessionPage } from "./routes/SessionPage.js";
import { useShellClient } from "./providers/ShellClientProvider.js";

function HomeRedirect() {
  const bundled = isBundledShell();
  const hasToken = Boolean(getStorageItem("murrmure_token"));
  const client = useShellClient();
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => client!.me.get(),
    enabled: Boolean(client),
  });
  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => client!.spaces.list(),
    enabled: Boolean(client),
  });

  if (meQuery.isLoading || spacesQuery.isLoading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  if (!hasToken && !bundled) {
    return <Navigate to="/connect" replace />;
  }

  const landing = meQuery.data?.landing_space_id;
  if (landing) {
    return <Navigate to={`/spaces/${landing}`} replace />;
  }

  const firstSpace = spacesQuery.data?.[0];
  if (firstSpace) {
    return <Navigate to={`/spaces/${firstSpace.space_id}`} replace />;
  }
  return <Navigate to={resolveHomeFallbackRoute(bundled, hasToken)} replace />;
}

export function resolveDefaultRoute(bundled: boolean, hasToken: boolean): string {
  if (!hasToken) {
    return bundled ? "/spaces/new" : "/connect";
  }
  return "/";
}

export function resolveHomeFallbackRoute(bundled: boolean, hasToken: boolean): string {
  if (!hasToken && !bundled) {
    return "/connect";
  }
  return "/spaces/new";
}

export function App() {
  const bundled = isBundledShell();
  const hasToken = Boolean(getStorageItem("murrmure_token"));
  const defaultRoute = useMemo(() => resolveDefaultRoute(bundled, hasToken), [bundled, hasToken]);

  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="/connect"
        element={bundled && hasToken ? <Navigate to="/spaces/new" replace /> : <ConnectPage />}
      />
      <Route path="/spaces/new" element={<SpacesNewPage />} />
      <Route path="/spaces/:spaceId" element={<SpaceHomePage />} />
      <Route path="/spaces/:spaceId/flows/:flowId" element={<FlowPreviewPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/logs" element={<LogsExplorerPage />} />
      <Route path="/runs/:runId" element={<RunPage />} />
      <Route path="/sessions/:sessionId" element={<SessionPage />} />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  );
}
