import { defineCommand } from "citty";
import {
  flowDoctorCommand,
  flowListCommand,
  flowStatusCommand,
} from "./commands.js";
import { flowRunCommand } from "./run.js";

export const flowCommand = defineCommand({
  meta: { name: "flow", description: "Flow commands — v2 index via space apply" },
  subCommands: {
    run: flowRunCommand,
    status: flowStatusCommand,
    list: flowListCommand,
    doctor: flowDoctorCommand,
  },
});
