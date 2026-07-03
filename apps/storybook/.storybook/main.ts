import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    "../../../packages/shell-ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../../../packages/shell-web/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: ["@storybook/addon-essentials", "@storybook/addon-interactions"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(config) {
    const [{ default: tailwindcss }, { mergeConfig }] = await Promise.all([
      import("@tailwindcss/vite"),
      import("vite"),
    ]);
    return mergeConfig(config, {
      plugins: [tailwindcss()],
    });
  },
};

export default config;
