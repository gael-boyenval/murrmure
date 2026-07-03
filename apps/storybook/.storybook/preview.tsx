import type { Preview } from "@storybook/react";
import "../src/styles.css";
import "@xyflow/react/dist/style.css";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "oklch(0.13 0 0)" }],
    },
  },
};

export default preview;
