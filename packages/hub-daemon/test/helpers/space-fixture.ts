import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

export interface HubTestFixture {
  baseUrl: string;
  bootstrapToken: string;
  dataDir: string;
  daemon: Awaited<ReturnType<typeof startHubDaemon>>;
  cleanup: () => void;
}

export interface SpaceApplyBundle {
  actions?: { digest: string; file: Record<string, unknown> };
  executors?: { digest: string; file: Record<string, unknown> };
  hooks?: { digest: string; file: Record<string, unknown> };
  handlers?: { digest: string; file: Record<string, unknown> };
  events?: { digest: string; file: Record<string, unknown> };
  bindings?: { digest: string; file: Record<string, unknown> };
  flows?: Array<{ digest?: string; manifest?: unknown; file?: Record<string, unknown> }>;
  views?: Array<{ digest?: string; manifest?: unknown; file?: Record<string, unknown> }>;
}

export async function startHubTestFixtureAsync(opts?: {
  bootstrapToken?: string;
  prefix?: string;
}): Promise<HubTestFixture> {
  const dir = mkdtempSync(join(tmpdir(), opts?.prefix ?? "hub-space-fixture-"));
  const dataDir = join(dir, "data");
  const bootstrapToken = opts?.bootstrapToken ?? "01JBOOTSTRAPTOKEN00000001";
  const daemon = await startHubDaemon({
    databasePath: join(dir, "murrmure.db"),
    port: 0,
    dataDir,
    defaultSpaceId: "",
    bootstrapToken,
  });
  const addr = daemon.server.address();
  const port = typeof addr === "object" && addr ? addr.port : 8787;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    bootstrapToken,
    dataDir,
    daemon,
    cleanup: () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function bootstrapAuth(token: string) {
  return {
    Authorization: `Bearer ${addTokenId(token)}`,
    "Content-Type": "application/json",
  };
}

export async function createSpace(
  baseUrl: string,
  bootstrapToken: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/spaces`, {
    method: "POST",
    headers: bootstrapAuth(bootstrapToken),
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as { space_id: string };
  return parsed.space_id;
}

export async function applySpaceBundle(
  baseUrl: string,
  bootstrapToken: string,
  spaceId: string,
  bundle: SpaceApplyBundle,
): Promise<Response> {
  return fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
    method: "POST",
    headers: bootstrapAuth(bootstrapToken),
    body: JSON.stringify({ bundle }),
  });
}
