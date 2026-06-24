import { createConsola } from "consola";
import { isJsonMode, printErr, printOk } from "./output.js";
import { mapHubDenial } from "./hub-request.js";

const consola = createConsola({ stdout: process.stderr });

export function parseCommaList(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function emitHubConfigJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const denial = mapHubDenial(res.status, body);
    printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
  }
  return body;
}

export function printHubConfigData(body: Record<string, unknown>): void {
  if (isJsonMode()) {
    printOk(body);
    return;
  }
  console.log(JSON.stringify(body, null, 2));
}

export function printMintGrantResult(body: Record<string, unknown>): void {
  if (isJsonMode()) {
    printOk(body);
    return;
  }

  const token = typeof body.token === "string" ? body.token : undefined;
  const grantId = typeof body.grant_id === "string" ? body.grant_id : undefined;
  const label = typeof body.label === "string" ? body.label : undefined;

  if (grantId) consola.success(`Grant created: ${grantId}`);
  if (label) consola.info(`Label: ${label}`);

  if (token) {
    console.log("");
    console.log(token);
    console.log("");
    consola.warn("Save this token — it will not be shown again.");
  } else {
    printHubConfigData(body);
  }
}
