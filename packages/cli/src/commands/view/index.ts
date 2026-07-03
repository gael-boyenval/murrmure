import { defineCommand } from "citty";
import { viewDevCommand } from "./dev.js";

export const viewCommand = defineCommand({
  meta: { name: "view", description: "Custom view dev loop (use `mrmr space view init` to scaffold)" },
  subCommands: {
    dev: viewDevCommand,
  },
});
