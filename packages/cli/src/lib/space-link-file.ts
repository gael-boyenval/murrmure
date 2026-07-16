import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { hostname } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const SPACE_FILE = ".mrmr/space/space.yaml";

export type SpaceLinkFile = {
  space_id: string;
  path?: string;
  host: string;
};

type SpaceYamlDoc = {
  link?: {
    space_id?: unknown;
    host?: unknown;
  };
  [key: string]: unknown;
};

function readSpaceYaml(cwd: string): { path: string; doc: SpaceYamlDoc } | null {
  const path = join(cwd, SPACE_FILE);
  if (!existsSync(path)) return null;
  const parsed = parseYaml(readFileSync(path, "utf-8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { path, doc: {} };
  }
  return { path, doc: parsed as SpaceYamlDoc };
}

export function readSpaceLink(cwd: string): SpaceLinkFile | null {
  const loaded = readSpaceYaml(cwd);
  if (!loaded?.doc.link || typeof loaded.doc.link !== "object") return null;
  const space_id = typeof loaded.doc.link.space_id === "string" ? loaded.doc.link.space_id : "";
  if (!space_id) return null;
  const host =
    typeof loaded.doc.link.host === "string" && loaded.doc.link.host.trim()
      ? loaded.doc.link.host
      : defaultLinkHost();
  return { space_id, host, path: cwd };
}

export function writeSpaceLink(cwd: string, link: SpaceLinkFile): void {
  const path = join(cwd, SPACE_FILE);
  const loaded = readSpaceYaml(cwd);
  const doc = loaded?.doc ?? {};
  doc.link = {
    space_id: link.space_id,
    host: link.host || defaultLinkHost(),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyYaml(doc), "utf-8");
}

export function defaultLinkHost(): string {
  return hostname();
}
