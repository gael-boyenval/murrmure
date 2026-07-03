import { defineCommand } from "citty";
import { spaceViewInitCommand } from "./view-init.js";

export const spaceViewCommand = defineCommand({
  meta: { name: "view", description: "Scaffold custom view packages under murrmure/views/" },
  subCommands: {
    init: spaceViewInitCommand,
  },
});
