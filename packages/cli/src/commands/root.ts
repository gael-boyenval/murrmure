import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { loginCommand, logoutCommand, whoamiCommand } from "./auth.js";
import { doctorCommand } from "./doctor.js";
import { healthCommand } from "./health.js";
import { flowCommand } from "./flow/index.js";
import { grantCommand } from "./grant.js";
import { hubCommand } from "./hub.js";
import { runtimeCommand } from "./runtime.js";
import { skillCommand } from "./skill.js";
import { spaceCommand } from "./space/index.js";
import { actionCommand } from "./action/index.js";
import { meCommand } from "./me/index.js";
import { workerCommand } from "./worker/index.js";
import { viewCommand } from "./view/index.js";
import { federationCommand } from "./federation.js";
import { mcpCommand } from "./mcp.js";
import { setupCommand } from "./setup.js";
import { globalArgs } from "../lib/flags.js";

function readCliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", "VERSION"), join(here, "..", "..", "VERSION")];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8").trim();
    } catch {
      /* try next */
    }
  }
  return "0.0.0";
}

export const rootCommand = defineCommand({
  meta: {
    name: "mrmr",
    version: readCliVersion(),
    description:
      "Murrmure CLI — auth, spaces, runtime, flows, skills, and MCP (`mrmr mcp`).",
  },
  args: globalArgs,
  subCommands: {
    login: loginCommand,
    logout: logoutCommand,
    whoami: whoamiCommand,
    setup: setupCommand,
    doctor: doctorCommand,
    health: healthCommand,
    space: spaceCommand,
    action: actionCommand,
    me: meCommand,
    worker: workerCommand,
    federation: federationCommand,
    grant: grantCommand,
    hub: hubCommand,
    runtime: runtimeCommand,
    flow: flowCommand,
    view: viewCommand,
    skill: skillCommand,
    mcp: mcpCommand,
  },
});
