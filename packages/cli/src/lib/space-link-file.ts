import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";

const LINK_FILE = ".murrmure/link.json";

export type SpaceLinkFile = {
  space_id: string;
  path: string;
  host: string;
};

export function readSpaceLink(cwd: string): SpaceLinkFile | null {
  const path = join(cwd, LINK_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as SpaceLinkFile;
}

export function writeSpaceLink(cwd: string, link: SpaceLinkFile): void {
  const dir = join(cwd, ".murrmure");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "link.json"), `${JSON.stringify(link, null, 2)}\n`, "utf-8");
}

export function defaultLinkHost(): string {
  return hostname();
}
