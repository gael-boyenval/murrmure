import { defineCommand } from "citty";
import {
  spaceArchiveCommand,
  spaceCreateCommand,
  spaceListCommand,
  spaceShowCommand,
  spaceUpdateCommand,
} from "./commands.js";
import { grantCommand } from "./grant.js";
import { spaceInitCommand } from "./init.js";
import { memberCommand } from "./member.js";
import { triggerCommand } from "./trigger.js";

export const spaceCommand = defineCommand({
  meta: { name: "space", description: "Space CRUD and Configure parity" },
  subCommands: {
    init: spaceInitCommand,
    list: spaceListCommand,
    show: spaceShowCommand,
    create: spaceCreateCommand,
    update: spaceUpdateCommand,
    archive: spaceArchiveCommand,
    grant: grantCommand,
    member: memberCommand,
    trigger: triggerCommand,
  },
});
