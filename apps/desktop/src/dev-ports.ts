export const DESKTOP_PORT = 8787;
export const DESKTOP_HOST = "127.0.0.1";
export const SHELL_DEV_PORT = 5174;

export function parseHubPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT ?? env.HUB_PORT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DESKTOP_PORT;
  }
  return parsed;
}

export function parseShellDevPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VITE_PORT ?? env.SHELL_DEV_PORT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SHELL_DEV_PORT;
  }
  return parsed;
}

export function resolveHubUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `http://${DESKTOP_HOST}:${parseHubPort(env)}`;
}

export function resolveShellDevUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `http://${DESKTOP_HOST}:${parseShellDevPort(env)}`;
}
