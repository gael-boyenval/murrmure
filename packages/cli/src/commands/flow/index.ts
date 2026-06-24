import { defineCommand } from "citty";
import {
  flowApplyCommand,
  flowBuildCommand,
  flowDevCommand,
  flowDoctorCommand,
  flowInitCommand,
  flowListCommand,
  flowPromoteCommand,
  flowPushCommand,
  flowRollbackCommand,
  flowStatusCommand,
  flowTestCommand,
  flowValidateCommand,
} from "./commands.js";

export const flowCommand = defineCommand({
  meta: { name: "flow", description: "Flow Dev Kit commands" },
  subCommands: {
    init: flowInitCommand,
    validate: flowValidateCommand,
    build: flowBuildCommand,
    push: flowPushCommand,
    status: flowStatusCommand,
    list: flowListCommand,
    doctor: flowDoctorCommand,
    test: flowTestCommand,
    promote: flowPromoteCommand,
    apply: flowApplyCommand,
    rollback: flowRollbackCommand,
    dev: flowDevCommand,
  },
});
