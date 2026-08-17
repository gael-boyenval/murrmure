import { defineCommand } from "citty";
import { meetingStartCommand } from "./start.js";

export const meetingCommand = defineCommand({
  meta: { name: "meeting", description: "Meeting commands — convene a room" },
  subCommands: {
    start: meetingStartCommand,
  },
});
