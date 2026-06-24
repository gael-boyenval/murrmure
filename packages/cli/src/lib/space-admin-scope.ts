import type { ScopeError } from "./scope.js";
import { isJsonMode, printErr } from "./output.js";

export function printSpaceAdminScopeError(
  err: Extract<ScopeError, { code: "SCOPE_MISSING" }>,
  action: string,
): never {
  const scopeSummary = err.scopes.join(", ");
  if (isJsonMode()) {
    printErr(err.code, err.message, {
      required_scope: err.requiredScope,
      space_id: err.spaceId,
      scopes: err.scopes,
      action,
    });
  } else {
    console.error(`✗ Missing scope: ${err.requiredScope}`);
    console.error(`Your token can ${scopeSummary} on ${err.spaceId} but cannot ${action}.`);
    console.error("Run: mrmr whoami");
  }
  process.exit(1);
  throw new Error("CLI_EXIT");
}
