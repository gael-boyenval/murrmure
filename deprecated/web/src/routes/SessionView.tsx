import { Link, useParams } from "react-router-dom";
import { client } from "../api";
import { useSession } from "../hooks/useSession";
import { CommentPanel } from "../components/CommentPanel";

/** Same-origin preview path with a cache-busting query per review round. */
function previewSrc(url: string | undefined, revision: number): string {
  if (!url) return "about:blank";
  try {
    const path = new URL(url, window.location.origin).pathname;
    const joiner = path.includes("?") ? "&" : "?";
    return `${path}${joiner}_studio_r=${revision}`;
  } catch {
    return url;
  }
}

export function SessionView() {
  const { key } = useParams<{ key: string }>();
  const { session, connected, error, previewRevision, refetch } = useSession(key);

  if (error) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/">← All sessions</Link>
      </div>
    );
  }

  if (!session || !key) {
    return (
      <div className="page">
        <p className="muted">Loading session…</p>
      </div>
    );
  }

  const state = session.round_state;
  const canFinish = state === "collecting_feedback";

  const onFinish = async () => {
    await client.sessions.finish(key);
    refetch();
  };

  return (
    <div className="studio">
      <header className="studio__header">
        <div className="studio__title">
          <Link to="/" className="muted">
            ←
          </Link>
          <strong>{session.session_key}</strong>
          <span className={`badge badge--${state}`}>{state.replace(/_/g, " ")}</span>
          <span className="muted">
            {session.view} · round {session.review_round}
          </span>
        </div>
        <span className={`dot ${connected ? "dot--on" : "dot--off"}`} title="Live connection">
          {connected ? "live" : "offline"}
        </span>
      </header>

      <div className="studio__body">
        <section className="preview">
          <iframe
            key={`preview-${previewRevision}`}
            title="App preview"
            src={previewSrc(session.target.url, previewRevision)}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </section>

        <aside className="panel">
          <CommentPanel sessionKey={key} session={session} onChange={refetch} />
        </aside>
      </div>

      <footer className="studio__gate">
        {state === "converged" ? (
          <span className="banner banner--done">Review converged — no unresolved comments.</span>
        ) : state === "awaiting_agent" ? (
          <span className="banner banner--wait">
            Agent applying fixes… Open the session list if you started a new review — an older
            tab may still show this state.
          </span>
        ) : (
          <button className="btn btn--primary" onClick={onFinish} disabled={!canFinish}>
            Finish Review
          </button>
        )}
      </footer>
    </div>
  );
}
