import { isJsonMode } from "./output.js";

export function emitFlowResult(
  data: Record<string, unknown>,
  human?: (data: Record<string, unknown>) => string,
): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
  } else if (human) {
    console.log(human(data));
  } else if (data.ok === false) {
    console.log(`✗ ${data.message ?? data.code ?? "Failed"}`);
  } else {
    console.log("✓ Done");
  }

  if ("ok" in data && data.ok === false) {
    process.exit(1);
  }
}
