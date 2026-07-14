import { createConsola } from "consola";
import type { ScopeError } from "./scope.js";

export const cliConsola = createConsola({ stdout: process.stderr });

const consola = cliConsola;

let jsonMode = false;

export function setJsonMode(value: boolean): void {
  jsonMode = value;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export type CliErrorPayload = {
  ok: false;
  code: string;
  message: string;
  hint?: unknown;
};

export function formatJsonOk(data: Record<string, unknown> = {}): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

export function formatJsonError(code: string, message: string, hint?: unknown): string {
  const payload: CliErrorPayload = { ok: false, code, message };
  if (hint !== undefined) payload.hint = hint;
  return JSON.stringify(payload, null, 2);
}

export function printOk(data: Record<string, unknown> = {}, humanLine?: string): void {
  if (jsonMode) {
    console.log(formatJsonOk(data));
    return;
  }
  if (humanLine) console.log(humanLine);
}

export function printErr(code: string, message: string, hint?: unknown): never {
  if (jsonMode) {
    console.log(formatJsonError(code, message, hint));
  } else {
    consola.error(`✗ ${message}`);
    if (hint && typeof hint === "object" && hint && "tip" in hint) {
      consola.info(String((hint as { tip: string }).tip));
    }
  }
  process.exit(1);
}

export function printScopeError(err: ScopeError): never {
  switch (err.code) {
    case "SCOPE_MISSING":
      printErr(err.code, `${err.message} (${err.requiredScope})`, {
        tip: "Run mrmr whoami · create a local connection with mrmr connection create",
        required_scope: err.requiredScope,
        space_id: err.spaceId,
      });
    case "SCOPE_UNKNOWN_SPACE":
      printErr(err.code, err.message, {
        tip: "Run mrmr whoami to see spaces your token can access",
        space_id: err.spaceId,
      });
    case "TOKEN_WRONG_SPACE":
      printErr(err.code, err.message, {
        tip: "Use a token for this space or pass --token with a matching grant",
        space_id: err.spaceId,
        token_space_id: err.tokenSpaceId,
      });
  }
}

export function printStubMessage(commandPath: string): never {
  const message = `${commandPath} is not implemented yet`;
  if (jsonMode) {
    console.log(formatJsonError("NOT_IMPLEMENTED", message));
  } else {
    consola.info(message);
  }
  process.exit(1);
}

export function exitUsage(message: string): never {
  if (jsonMode) {
    console.log(formatJsonError("USAGE", message));
  } else {
    consola.error(message);
  }
  process.exit(2);
}
