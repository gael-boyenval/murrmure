import { defineCommand } from "citty";
import { actionInvokeCommand } from "./invoke.js";

export const actionCommand = defineCommand({
  meta: { name: "action", description: "Space-indexed action invoke" },
  subCommands: {
    invoke: actionInvokeCommand,
  },
});
