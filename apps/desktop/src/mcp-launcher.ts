import {
  chmodSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export interface LauncherInstallResult {
  command: string;
  supported: boolean;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function launcherPath(dataDir: string): string {
  return join(dataDir, "bin", "murrmure-mcp");
}

export function buildMcpLauncherScript(options: {
  discoveryPath: string;
  bridgeEntry: string;
  nodeBinary: string;
}): string {
  const discovery = shellQuote(options.discoveryPath);
  const expectedEntry = shellQuote(options.bridgeEntry);
  const expectedNode = shellQuote(options.nodeBinary);
  return `#!/bin/sh
set -eu
DISCOVERY=${discovery}
EXPECTED_ENTRY=${expectedEntry}
EXPECTED_NODE=${expectedNode}

if [ ! -f "$DISCOVERY" ]; then
  echo "murrmure-mcp: bundled bridge discovery is missing; restart Murrmure Desktop" >&2
  exit 64
fi

ENTRY=$(/usr/bin/plutil -extract mcp_bridge.entry raw "$DISCOVERY" 2>/dev/null || true)
NODE=$(/usr/bin/plutil -extract mcp_bridge.runtime raw "$DISCOVERY" 2>/dev/null || true)
if [ -z "$ENTRY" ] || [ -z "$NODE" ]; then
  echo "murrmure-mcp: bundled bridge discovery is stale; restart Murrmure Desktop" >&2
  exit 65
fi
if [ "$ENTRY" != "$EXPECTED_ENTRY" ] || [ "$NODE" != "$EXPECTED_NODE" ]; then
  echo "murrmure-mcp: bundled bridge discovery failed validation; restart Murrmure Desktop" >&2
  exit 66
fi
if [ ! -f "$ENTRY" ] || [ ! -x "$NODE" ]; then
  echo "murrmure-mcp: bundled bridge binary is unavailable; reinstall Murrmure Desktop" >&2
  exit 67
fi

exec "$NODE" "$ENTRY" "$@"
`;
}

export function installMcpLauncher(options: {
  dataDir: string;
  bridgeEntry: string | null;
  nodeBinary: string;
  platform?: NodeJS.Platform;
}): LauncherInstallResult {
  const command = launcherPath(options.dataDir);
  if ((options.platform ?? process.platform) !== "darwin") {
    return { command, supported: false };
  }
  if (!options.bridgeEntry) {
    return { command, supported: false };
  }
  mkdirSync(dirname(command), { recursive: true, mode: 0o700 });
  const temporary = `${command}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    buildMcpLauncherScript({
      discoveryPath: join(options.dataDir, "hubs", "shared.json"),
      bridgeEntry: options.bridgeEntry,
      nodeBinary: options.nodeBinary,
    }),
    { mode: 0o700 },
  );
  chmodSync(temporary, 0o700);
  renameSync(temporary, command);
  return { command, supported: true };
}
