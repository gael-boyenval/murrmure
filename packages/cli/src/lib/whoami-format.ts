import type { WhoamiResponse } from "./auth-context.js";

export function formatWhoamiHeader(whoami: WhoamiResponse): string {
  const expires = whoami.expires_at ?? "—";
  return `actor: ${whoami.actor_id}  token: ${whoami.token_id}  kind: ${whoami.kind}  expires: ${expires}`;
}

export function formatWhoamiTable(whoami: WhoamiResponse): string {
  const lines = [formatWhoamiHeader(whoami), ""];

  if (whoami.spaces.length === 0) {
    lines.push("(no spaces — bootstrap token on empty hub, or token not bound to a space yet)");
    return lines.join("\n");
  }

  const spaceWidth = Math.max(5, ...whoami.spaces.map((entry) => entry.space_id.length));
  lines.push(`${"SPACE".padEnd(spaceWidth)}  SCOPES`);
  for (const entry of whoami.spaces) {
    lines.push(`${entry.space_id.padEnd(spaceWidth)}  ${entry.scopes.join(", ")}`);
  }

  return lines.join("\n");
}
