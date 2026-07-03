import { defineCommand } from "citty";
import { spaceFlowInitCommand } from "./flow-init.js";

export const spaceFlowCommand = defineCommand({
  meta: { name: "flow", description: "Scaffold indexed flows under murrmure/flows/" },
  subCommands: {
    init: spaceFlowInitCommand,
  },
});
