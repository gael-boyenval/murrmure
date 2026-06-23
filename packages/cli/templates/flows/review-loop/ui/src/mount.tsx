import type { FlowHostContext } from "@murrmure/flow-dev-kit/host";

// Self-contained review canvas (no framework imports) — see the feature-spec
// example for the rationale. Renders the current review session and round state.

interface Comment {
  id: string;
  author: string;
  body: string;
}

interface SessionJson {
  session_key: string;
  review_round: number;
  round_state: string;
  target?: { url?: string };
  threads: Record<string, Comment[]>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mount(root: HTMLElement, ctx: FlowHostContext): () => void {
  let disposed = false;
  const render = (inner: string) => {
    if (!disposed) root.innerHTML = inner;
  };

  render(`<main style="font-family:system-ui;padding:24px"><p>Loading session…</p></main>`);

  void (async () => {
    try {
      const res = await ctx.hubFetch(`/api/review-loop/sessions/${ctx.instanceId}`);
      if (!res.ok) {
        render(`<main style="font-family:system-ui;padding:24px"><p>Failed to load session (${res.status}).</p></main>`);
        return;
      }
      const session = (await res.json()) as SessionJson;
      const comments = Object.values(session.threads ?? {})
        .flat()
        .map((c) => `<li><strong>${escapeHtml(c.author)}</strong>: ${escapeHtml(c.body)}</li>`)
        .join("");
      render(
        `<main style="font-family:system-ui;padding:24px;max-width:960px">` +
          `<h1>Review — ${escapeHtml(session.session_key)}</h1>` +
          `<p>Round ${session.review_round} · ${escapeHtml(session.round_state)}</p>` +
          `<section><h2>Comments</h2><ul>${comments || "<li>No comments yet.</li>"}</ul></section>` +
          `</main>`,
      );
    } catch (error) {
      render(`<main style="font-family:system-ui;padding:24px"><p>Error: ${escapeHtml(String(error))}</p></main>`);
    }
  })();

  return () => {
    disposed = true;
    root.innerHTML = "";
  };
}
