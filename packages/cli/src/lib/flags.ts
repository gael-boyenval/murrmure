import type { ArgsDef, ParsedArgs } from "citty";
import { setJsonMode } from "./output.js";

export const globalArgs = {
  json: {
    type: "boolean",
    description: "Emit JSON on stdout (for scripts)",
    default: false,
  },
  space: {
    type: "string",
    description: "Target space ID",
    alias: ["s"],
  },
  "hub-url": {
    type: "string",
    description: "Hub base URL override",
  },
  token: {
    type: "string",
    description: "Bearer token override",
  },
} satisfies ArgsDef;

export interface GlobalFlags {
  json: boolean;
  space?: string;
  hubUrl?: string;
  token?: string;
}

export function parseGlobalFlags(args: ParsedArgs | Record<string, unknown>): GlobalFlags {
  const json = Boolean(args.json);
  setJsonMode(json);
  const hubUrl =
    typeof args["hub-url"] === "string"
      ? args["hub-url"]
      : typeof args.hubUrl === "string"
        ? args.hubUrl
        : undefined;
  return {
    json,
    space: typeof args.space === "string" ? args.space : undefined,
    hubUrl,
    token: typeof args.token === "string" ? args.token : undefined,
  };
}
