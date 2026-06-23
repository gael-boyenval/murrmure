import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SessionSummary } from "@studio/review-contracts";
import { client } from "../api";

export function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.sessions
      .list()
      .then(setSessions)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Agent Review Studio</h1>
        <span className="muted">Local review sessions</span>
      </header>

      <main className="page__body">
        {error && <p className="error">Daemon unreachable: {error}</p>}
        {!error && sessions.length === 0 && (
          <div className="empty">
            <p>No sessions yet.</p>
            <p className="muted">
              Start one from an agent with{" "}
              <code>studio review --create</code>.
            </p>
          </div>
        )}
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.session_key}>
              <Link
                to={`/sessions/${session.session_key}`}
                className={`session-card${session.round_state === "collecting_feedback" ? " session-card--active" : ""}`}
              >
                <span className="session-card__key">{session.session_key}</span>
                {session.round_state === "collecting_feedback" && (
                  <span className="badge badge--active">review now</span>
                )}
                <span className={`badge badge--${session.round_state}`}>
                  {session.round_state.replace(/_/g, " ")}
                </span>
                <span className="muted">
                  {session.view} · round {session.review_round} ·{" "}
                  {session.unresolved} unresolved
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
