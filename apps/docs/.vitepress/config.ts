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
  title: "Studio",
  description: "Install, configure, and use Studio — human/agent coordination with clear handoffs and audit trails.",
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
      { text: "Guide", link: "/guide/introduction" },
      { text: "Tutorials", link: "/guide/tutorials/" },
      { text: "Why Studio", link: "/guide/why-studio" },
      { text: "Reference", link: "/reference/environment" },
      { text: "Sign in", link: "https://app.studio.dev" },
      { text: "Sign up", link: "https://app.studio.dev/signup" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Getting started",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Why Studio", link: "/guide/why-studio" },
            { text: "How it fits together", link: "/guide/how-it-fits-together" },
            { text: "Create an account", link: "/guide/account" },
            { text: "Install dependencies", link: "/guide/installation" },
            { text: "Connect your agent (MCP)", link: "/guide/agents-mcp" },
            { text: "Quick start (5 minutes)", link: "/guide/quick-start" },
            { text: "Browser app", link: "/guide/browser" },
            { text: "Capability evolution", link: "/guide/capability-evolution" },
          ],
        },
        {
          text: "Tutorials",
          collapsed: false,
          items: [
            { text: "Overview", link: "/guide/tutorials/" },
            {
              text: "1 — Local preview review",
              link: "/guide/tutorials/01-local-preview-review/",
              items: [
                { text: "Overview", link: "/guide/tutorials/01-local-preview-review/" },
                { text: "Scaffold capability", link: "/guide/tutorials/01-local-preview-review/01-scaffold-capability" },
                { text: "Install and connect", link: "/guide/tutorials/01-local-preview-review/02-install-and-connect" },
                { text: "Run feedback loop", link: "/guide/tutorials/01-local-preview-review/03-run-feedback-loop" },
              ],
            },
            {
              text: "2 — Multi-agent brief",
              link: "/guide/tutorials/02-multi-agent-brief/",
              items: [
                { text: "Overview", link: "/guide/tutorials/02-multi-agent-brief/" },
                { text: "Build capability", link: "/guide/tutorials/02-multi-agent-brief/01-build-orchestrator-capability" },
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
                { text: "Scaffold capability", link: "/guide/tutorials/03-daily-brief-trigger/01-scaffold-daily-brief" },
                { text: "Push and trigger", link: "/guide/tutorials/03-daily-brief-trigger/02-push-and-trigger" },
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
          text: "Capabilities",
          items: [
            { text: "Tutorial (complete)", link: "/guide/capabilities-tutorial" },
            { text: "Overview", link: "/guide/creating-capabilities" },
            { text: "Agent skill", link: "/guide/agent-skill" },
          ],
        },
        {
          text: "Tools",
          items: [
            { text: "Configure (admins)", link: "/guide/configuration" },
            { text: "CLI", link: "/guide/cli" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Self-hosted hub", link: "/guide/self-hosted" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
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
            { text: "Capability SDK CLI", link: "/reference/capability-sdk" },
            { text: "Agent skill package", link: "/reference/agent-skill" },
          ],
        },
      ],
    },
    footer: {
      message: "Studio — where humans and agents do the work together.",
      copyright: "Copyright © 2026",
    },
  },
});
