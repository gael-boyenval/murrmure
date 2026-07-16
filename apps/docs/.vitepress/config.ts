import { defineConfig } from "vitepress";
import type MarkdownIt from "markdown-it";

function mermaidPlainFence(md: MarkdownIt) {
  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    if (token.info.trim() === "mermaid") {
      const code = md.utils.escapeHtml(token.content);
      // Skip Shiki highlighting so vitepress-mermaid-renderer can replace the block.
      return `<pre class="language-mermaid"><code class="language-mermaid">${code}</code></pre>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };
}

export default defineConfig({
  title: "Murrmure",
  description: "Murrmure Desktop and CLI — human/agent coordination with clear handoffs and audit trails.",
  lang: "en-US",
  markdown: {
    config: mermaidPlainFence,
  },
  vite: {
    optimizeDeps: {
      include: ["mermaid"],
    },
  },
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/desktop" },
      { text: "CLI", link: "/guide/cli" },
      { text: "Tutorials", link: "/guide/tutorials/" },
      { text: "Why Murrmure", link: "/guide/why-murrmure" },
      { text: "Reference", link: "/reference/environment" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Getting started",
          items: [
            { text: "Murrmure Desktop", link: "/guide/desktop" },
            { text: "Quick start (5 minutes)", link: "/guide/quick-start" },
            { text: "CLI", link: "/guide/cli" },
            { text: "Space index", link: "/guide/space-index" },
            { text: "Connect your agent (MCP)", link: "/guide/agents-mcp" },
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Why Murrmure", link: "/guide/why-murrmure" },
            { text: "How it fits together", link: "/guide/how-it-fits-together" },
            { text: "Install dependencies", link: "/guide/installation" },
            { text: "Shell UI routes", link: "/guide/shell-routes" },
          ],
        },
        {
          text: "Tutorials",
          collapsed: false,
          items: [
            { text: "Overview", link: "/guide/tutorials/" },
            {
              text: "1a — First flow (v3)",
              link: "/guide/tutorials/01-local-preview-review-v3/",
              items: [
                { text: "Overview", link: "/guide/tutorials/01-local-preview-review-v3/" },
                { text: "1 — Launch & space", link: "/guide/tutorials/01-local-preview-review-v3/01-launch-and-create-space" },
                { text: "2 — Minimal flow", link: "/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow" },
                { text: "3 — Intake view", link: "/guide/tutorials/01-local-preview-review-v3/03-build-intake-view" },
                { text: "4 — Run & understand", link: "/guide/tutorials/01-local-preview-review-v3/04-run-and-understand" },
                { text: "5 — Copy & build", link: "/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers" },
                { text: "6 — Cleanup", link: "/guide/tutorials/01-local-preview-review-v3/06-cleanup-and-commit" },
              ],
            },
          ],
        },
        {
          text: "Workflows (reference)",
          collapsed: true,
          items: [
            { text: "Review workflow", link: "/guide/review-workflow" },
            { text: "Multi-agent feature spec", link: "/guide/multi-agent-feature-spec" },
          ],
        },
        {
          text: "Flows",
          items: [
            { text: "Space index", link: "/guide/space-index" },
            { text: "Space handlers", link: "/guide/space-handlers" },
            { text: "Overview", link: "/guide/creating-flows" },
            { text: "Agent skill", link: "/guide/agent-skill" },
            { text: "Admin commands (CLI)", link: "/guide/configuration" },
          ],
        },
        {
          text: "More",
          items: [
            { text: "Known gaps (backlog)", link: "/guide/known-gaps" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
            { text: "Planned: Cloud", link: "/guide/future/cloud" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Environment variables", link: "/reference/environment" },
            { text: "HTTP API overview", link: "/reference/http-api" },
            { text: "MCP tools", link: "/reference/mcp-tools" },
            { text: "Shell client", link: "/reference/shell-client" },
            { text: "View SDK", link: "/reference/view-sdk" },
            { text: "Agent skill package", link: "/reference/agent-skill" },
          ],
        },
      ],
    },
    footer: {
      message: "Murrmure — where humans and agents do the work together.",
      copyright: "Copyright © 2026",
    },
  },
});
