import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;
export const DEFAULT_WEB_URL = "http://127.0.0.1:5173";

export const STUDIO_HOME = process.env.STUDIO_HOME ?? join(homedir(), ".studio");
export const REVIEWS_DIR = join(STUDIO_HOME, "reviews");

export function daemonHost(): string {
  return process.env.STUDIO_HOST ?? DEFAULT_HOST;
}

export function daemonPort(): number {
  return Number(process.env.STUDIO_PORT ?? DEFAULT_PORT);
}

export function daemonBaseUrl(): string {
  return `http://${daemonHost()}:${daemonPort()}`;
}

export function webBaseUrl(): string {
  return process.env.STUDIO_WEB_URL ?? DEFAULT_WEB_URL;
}

/** Default preview target for US-001 — the daemon-served demo fixture. */
export function fixtureUrl(): string {
  return `${daemonBaseUrl()}/fixtures/demo/`;
}
