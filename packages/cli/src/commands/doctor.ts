import { defineCommand, type CommandDef } from "citty";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { formatDoctorHuman, runDoctor } from "../lib/doctor.js";
import { printErr } from "../lib/output.js";

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Hub, auth, and scope diagnostics (Requires: any valid token)",
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const result = await runDoctor({ hubUrl: flags.hubUrl, token: flags.token });

    if (result.issues.some((issue) => issue.code === "AUTH_MISSING")) {
      printErr("AUTH_MISSING", result.issues[0]!.message);
    }

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatDoctorHuman(result));
    }

    if (!result.ok) {
      process.exit(1);
    }
  },
}) as CommandDef;
