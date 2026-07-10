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
                { text: "3 — Run & understand", link: "/guide/tutorials/01-local-preview-review-v3/03-run-and-understand" },
              ],
            },
            {
              text: "1b — Local preview review (full)",
              link: "/guide/tutorials/01-local-preview-review/",
              items: [
                { text: "Overview", link: "/guide/tutorials/01-local-preview-review/" },
                { text: "1 — Create the repo", link: "/guide/tutorials/01-local-preview-review/01-create-the-repo" },
                { text: "2 — Setup wizard", link: "/guide/tutorials/01-local-preview-review/02-setup-wizard" },
                { text: "3 — agent.md and skills", link: "/guide/tutorials/01-local-preview-review/03-agent-md-and-skills" },
                { text: "4 — Prompt triggers", link: "/guide/tutorials/01-local-preview-review/04-prompt-triggers" },
                { text: "5 — Flow manifest", link: "/guide/tutorials/01-local-preview-review/05-flow-manifest" },
                { text: "6 — Build views", link: "/guide/tutorials/01-local-preview-review/06-build-views" },
                { text: "7 — Index and apply", link: "/guide/tutorials/01-local-preview-review/07-index-and-apply" },
                { text: "8 — Run the loop", link: "/guide/tutorials/01-local-preview-review/08-run-the-loop" },
                { text: "9 — Troubleshooting", link: "/guide/tutorials/01-local-preview-review/09-troubleshooting" },
              ],
            },
            {
              text: "2 — Multi-agent brief",
              link: "/guide/tutorials/02-multi-agent-brief/",
              items: [
                { text: "Overview", link: "/guide/tutorials/02-multi-agent-brief/" },
                { text: "Build flow", link: "/guide/tutorials/02-multi-agent-brief/01-build-orchestrator-flow" },
                { text: "Admin setup", link: "/guide/tutorials/02-multi-agent-brief/02-admin-setup" },
                { text: "Connect agents", link: "/guide/tutorials/02-multi-agent-brief/03-connect-agents" },
                { text: "Run workflow", link: "/guide/tutorials/02-multi-agent-brief/04-run-workflow" },
                { text: "Troubleshooting", link: "/guide/tutorials/02-multi-agent-brief/05-troubleshooting" },
              ],
            },
            {
              text: "3 — Daily brief trigger",
              link: "/guide/tutorials/03-daily-brief-trigger/",
              items: [
                { text: "Overview", link: "/guide/tutorials/03-daily-brief-trigger/" },
                { text: "Initialize and write flow", link: "/guide/tutorials/03-daily-brief-trigger/01-scaffold-daily-brief" },
                { text: "View, hooks, apply", link: "/guide/tutorials/03-daily-brief-trigger/02-push-and-trigger" },
                { text: "Connect agent", link: "/guide/tutorials/03-daily-brief-trigger/03-connect-agent" },
                { text: "Run and review", link: "/guide/tutorials/03-daily-brief-trigger/04-run-and-review" },
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
