import type { CapabilityHostContext } from "@studio/capability-sdk/host";

// Self-contained canvas (no framework imports) so the example bundles with the
// CDK build step without a prior `npm install`. The scaffold produced by
// `studio capability init` uses the React dev kit; this reference keeps the
// dependency surface minimal while exercising the same hub-fetch bridge.

interface SpecSection {
  title: string;
  body: string;
  order: number;
}

interface SpecJson {
  spec_key: string;
  title: string;
  state: string;
  version: number;
  sections: Record<string, SpecSection>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mount(root: HTMLElement, ctx: CapabilityHostContext): () => void {
  let disposed = false;
  const render = (inner: string) => {
    if (!disposed) root.innerHTML = inner;
  };

  render(`<main style="font-family:system-ui;padding:24px"><p>Loading spec…</p></main>`);

  void (async () => {
    try {
      const res = await ctx.hubFetch(`/api/feature-spec/specs/${ctx.instanceId}`);
      if (!res.ok) {
        render(`<main style="font-family:system-ui;padding:24px"><p>Failed to load spec (${res.status}).</p></main>`);
        return;
      }
      const spec = (await res.json()) as SpecJson;
      const sections = Object.values(spec.sections ?? {})
        .sort((a, b) => a.order - b.order)
        .map(
          (section) =>
            `<article style="margin-bottom:16px;padding:12px;border:1px solid #ddd"><h3>${escapeHtml(section.title)}</h3><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(section.body)}</pre></article>`,
        )
        .join("");
      render(
        `<main style="font-family:system-ui;padding:24px;max-width:960px">` +
          `<header style="margin-bottom:24px"><h1>${escapeHtml(spec.title)}</h1>` +
          `<p><span style="padding:2px 8px;background:#eee;border-radius:4px">${escapeHtml(spec.state)}</span> · Version ${spec.version}</p></header>` +
          `<section><h2>Sections</h2>${sections || "<p>No sections yet.</p>"}</section>` +
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
