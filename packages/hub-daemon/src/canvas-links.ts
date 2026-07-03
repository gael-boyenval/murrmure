import type { DaemonContext } from "./context.js";

export async function enrichInstanceToolResult(
  ctx: DaemonContext,
  spaceId: string,
  result: unknown,
): Promise<unknown> {
  void ctx;
  void spaceId;
  return result;
}
