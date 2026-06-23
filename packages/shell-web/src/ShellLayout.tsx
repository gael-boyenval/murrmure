import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useActiveSpaceId } from "./hooks.js";

const styles = {
  shell: { fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column" as const },
  topbar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "10px 20px",
    borderBottom: "1px solid #e5e5e5",
    background: "#fafafa",
  },
  body: { display: "flex", flex: 1 },
  sidebar: { width: 200, padding: 16, borderRight: "1px solid #e5e5e5", background: "#fcfcfc" },
  main: { flex: 1, padding: 24 },
  navLink: (active: boolean) => ({
    display: "block",
    padding: "6px 0",
    color: active ? "#111" : "#555",
    fontWeight: active ? 600 : 400,
    textDecoration: "none",
  }),
  toggle: (active: boolean) => ({
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid #ccc",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#333",
    cursor: "pointer",
    textDecoration: "none",
    fontSize: 14,
  }),
};

export function ShellLayout({
  mode,
  children,
  spaceId,
}: {
  mode: "runtime" | "configure";
  children: ReactNode;
  spaceId?: string;
}) {
  const location = useLocation();
  const activeSpaceId = useActiveSpaceId();
  const configureSpaceMatch = location.pathname.match(/\/configure\/spaces\/([^/]+)/);
  const resolvedSpaceId = spaceId ?? configureSpaceMatch?.[1] ?? activeSpaceId;
  const runtimeBase = resolvedSpaceId ? `/spaces/${resolvedSpaceId}` : "/connect";
  const configureBase = "/configure";

  return (
    <div style={styles.shell}>
      <header style={styles.topbar}>
        <strong>Studio</strong>
        <span style={{ color: "#888", fontSize: 13 }}>Hub ●</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link to={runtimeBase} style={styles.toggle(mode === "runtime")}>
            Runtime
          </Link>
          <Link to={configureBase} style={styles.toggle(mode === "configure")}>
            Configure
          </Link>
        </div>
      </header>
      <div style={styles.body}>
        <aside style={styles.sidebar}>
          {mode === "runtime" ? (
            <>
              <small style={{ color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Runtime</small>
              {resolvedSpaceId && (
                <>
                  <Link to={`/spaces/${resolvedSpaceId}`} style={styles.navLink(location.pathname === `/spaces/${resolvedSpaceId}`)}>
                    Instances
                  </Link>
                  <Link to={`/spaces/${resolvedSpaceId}/gates`} style={styles.navLink(location.pathname.includes("/gates"))}>
                    Gates
                  </Link>
                  <Link to={`/spaces/${resolvedSpaceId}/audit`} style={styles.navLink(location.pathname.includes("/audit"))}>
                    Audit
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              <small style={{ color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Configure</small>
              <Link to="/configure" style={styles.navLink(location.pathname === "/configure")}>
                Dashboard
              </Link>
              <Link to="/setup" style={styles.navLink(location.pathname === "/setup")}>
                Setup wizard
              </Link>
              {resolvedSpaceId && (
                <>
                  <Link
                    to={`/configure/spaces/${resolvedSpaceId}`}
                    style={styles.navLink(location.pathname.includes(`/spaces/${resolvedSpaceId}`) && !location.pathname.includes("/flows") && !location.pathname.includes("/grants") && !location.pathname.includes("/triggers") && !location.pathname.includes("/members"))}
                  >
                    Space settings
                  </Link>
                  <Link
                    to={`/configure/spaces/${resolvedSpaceId}/flows`}
                    style={styles.navLink(location.pathname.includes("/flows"))}
                  >
                    Flows
                  </Link>
                  <Link
                    to={`/configure/spaces/${resolvedSpaceId}/grants`}
                    style={styles.navLink(location.pathname.includes("/grants"))}
                  >
                    Agent grants
                  </Link>
                  <Link
                    to={`/configure/spaces/${resolvedSpaceId}/triggers`}
                    style={styles.navLink(location.pathname.includes("/triggers"))}
                  >
                    Triggers
                  </Link>
                  <Link
                    to={`/configure/spaces/${resolvedSpaceId}/members`}
                    style={styles.navLink(location.pathname.includes("/members"))}
                  >
                    Members
                  </Link>
                </>
              )}
              <Link to="/configure/hub" style={styles.navLink(location.pathname === "/configure/hub")}>
                Hub settings
              </Link>
            </>
          )}
        </aside>
        <main style={styles.main}>{children}</main>
      </div>
    </div>
  );
}
