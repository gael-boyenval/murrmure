import DefaultTheme from "vitepress/theme";
import { inBrowser, onContentUpdated } from "vitepress";
import type { Theme } from "vitepress";
import "./mermaid.css";

let mermaidModule: typeof import("mermaid") | null = null;

async function getMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import("mermaid");
  }
  return mermaidModule.default;
}

async function renderMermaidDiagrams() {
  if (!inBrowser) return;

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("pre.language-mermaid"),
  ).filter((node) => !node.querySelector("svg"));

  if (nodes.length === 0) return;

  const mermaid = await getMermaid();
  const isDark = document.documentElement.classList.contains("dark");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: isDark ? "dark" : "neutral",
  });

  for (const node of nodes) {
    const code = node.querySelector("code")?.textContent ?? node.textContent;
    node.textContent = code.trim();
    node.classList.add("mermaid");
  }

  try {
    await mermaid.run({ nodes });
  } catch (err) {
    console.error("[docs] mermaid render failed:", err);
  }
}

export default {
  extends: DefaultTheme,
  setup() {
    onContentUpdated(() => {
      void renderMermaidDiagrams();
    });
  },
} satisfies Theme;
