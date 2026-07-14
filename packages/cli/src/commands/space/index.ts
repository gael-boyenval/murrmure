import { defineCommand } from "citty";
import {
  spaceArchiveCommand,
  spaceCreateCommand,
  spaceListCommand,
  spaceShowCommand,
  spaceUpdateCommand,
} from "./commands.js";
import { spaceInitCommand } from "./init.js";
import { spaceLinkCommand } from "./link.js";
import { spaceApplyCommand } from "./apply.js";
import { spaceStatusCommand } from "./status.js";
import { spaceDoctorCommand } from "./doctor.js";
import { spaceSetupCommand } from "./setup.js";
import { memberCommand } from "./member.js";
import { triggerCommand } from "./trigger.js";
import { spaceViewCommand } from "./view.js";
import { spaceFlowCommand } from "./flow.js";

export const spaceCommand = defineCommand({
  meta: { name: "space", description: "Space CRUD and Configure parity" },
  subCommands: {
    init: spaceInitCommand,
    setup: spaceSetupCommand,
    link: spaceLinkCommand,
    apply: spaceApplyCommand,
    status: spaceStatusCommand,
    doctor: spaceDoctorCommand,
    list: spaceListCommand,
    show: spaceShowCommand,
    create: spaceCreateCommand,
    update: spaceUpdateCommand,
    archive: spaceArchiveCommand,
    member: memberCommand,
    trigger: triggerCommand,
    view: spaceViewCommand,
    flow: spaceFlowCommand,
  },
});
