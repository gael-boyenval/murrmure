import { defineCommand } from "citty";
import { stepResolveCommand } from "./run/step-resolve.js";

export const stepCommand = defineCommand({
  meta: {
    name: "step",
    description: "Step-level runtime operations",
  },
  subCommands: {
    resolve: stepResolveCommand,
  },
});
