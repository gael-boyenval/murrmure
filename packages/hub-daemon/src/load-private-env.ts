import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const WORKSPACE_MARKER = "pnpm-workspace.yaml";
const DEFAULT_ENV_BASENAME = ".env.local";
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type PrivateEnvFileErrorCode =
  | "ENV_FILE_MISSING"
  | "ENV_FILE_PERMISSIONS"
  | "ENV_FILE_SYMLINK"
  | "ENV_FILE_MALFORMED";

export class PrivateEnvFileError extends Error {
  constructor(
    readonly code: PrivateEnvFileErrorCode,
    message: string,
    readonly path: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = "PrivateEnvFileError";
  }
}

export interface ResolveHubEnvFileOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedHubEnvFile {
  path: string;
  required: boolean;
}

export interface LoadPrivateEnvOptions {
  required?: boolean;
  log?: (message: string) => void;
}

export interface LoadPrivateEnvResult {
  loaded: number;
  skipped: boolean;
}

export function resolveHubEnvFilePath(
  options: ResolveHubEnvFileOptions = {},
): ResolvedHubEnvFile {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const override = env.MURRMURE_ENV_FILE?.trim();
  if (override) {
    return {
      path: isAbsolute(override) ? override : resolve(cwd, override),
      required: true,
    };
  }
  const workspaceRoot = findWorkspaceRoot(cwd);
  return {
    path: join(workspaceRoot ?? cwd, DEFAULT_ENV_BASENAME),
    required: false,
  };
}

export function loadPrivateEnvFile(
  path: string,
  target: NodeJS.ProcessEnv = process.env,
  options: LoadPrivateEnvOptions = {},
): LoadPrivateEnvResult {
  const log = options.log ?? defaultLog;
  const stats = statEnvFile(path, options.required === true, log);
  if (!stats) {
    return { loaded: 0, skipped: true };
  }

  const parsed = parseEnvFile(readFileSync(path, "utf8"), path);
  let loaded = 0;
  for (const [key, value] of parsed) {
    if (target[key] === undefined) {
      target[key] = value;
      loaded += 1;
    }
  }
  log(`loaded ${loaded} variables from ${path}`);
  return { loaded, skipped: false };
}

function defaultLog(message: string): void {
  console.log(message);
}

function findWorkspaceRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function statEnvFile(
  path: string,
  required: boolean,
  log: (message: string) => void,
): ReturnType<typeof lstatSync> | null {
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (isFsCode(error, "ENOENT")) {
      if (required) {
        throw new PrivateEnvFileError("ENV_FILE_MISSING", `env file missing: ${path}`, path);
      }
      log(`env file not found: ${path}`);
      return null;
    }
    if (isFsCode(error, "EACCES")) {
      throw new PrivateEnvFileError(
        "ENV_FILE_PERMISSIONS",
        `env file must be owner-only (chmod 600): ${path}`,
        path,
      );
    }
    throw error;
  }

  if (stats.isSymbolicLink()) {
    throw new PrivateEnvFileError("ENV_FILE_SYMLINK", `env file must not be a symlink: ${path}`, path);
  }
  if (!stats.isFile()) {
    throw new PrivateEnvFileError(
      "ENV_FILE_MALFORMED",
      `env file is not a regular file: ${path}`,
      path,
    );
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new PrivateEnvFileError(
      "ENV_FILE_PERMISSIONS",
      `env file must be owner-only (chmod 600): ${path}`,
      path,
    );
  }
  return stats;
}

function parseEnvFile(text: string, path: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = i + 1;
    const trimmed = lines[i]!.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const exported = trimmed.match(/^export\s+([\s\S]+)$/);
    const body = exported ? exported[1]! : trimmed;
    const eq = body.indexOf("=");
    if (eq === -1) {
      throw malformed(path, line, "missing '='");
    }
    const key = body.slice(0, eq).trim();
    if (!KEY_PATTERN.test(key)) {
      throw malformed(path, line, "invalid key");
    }
    out.set(key, parseEnvValue(body.slice(eq + 1), path, line));
  }
  return out;
}

function parseEnvValue(raw: string, path: string, line: number): string {
  const rest = raw.replace(/^\s*/, "");
  if (rest.startsWith('"') || rest.startsWith("'")) {
    return parseQuotedValue(rest, rest[0] as '"' | "'", path, line);
  }
  const comment = rest.search(/\s+#/);
  return (comment === -1 ? rest : rest.slice(0, comment)).trimEnd();
}

function parseQuotedValue(
  rest: string,
  quote: '"' | "'",
  path: string,
  line: number,
): string {
  let i = 1;
  let out = "";
  while (i < rest.length) {
    const ch = rest[i]!;
    if (quote === '"' && ch === "\\") {
      const next = rest[i + 1];
      if (next === undefined) {
        throw malformed(path, line, "unclosed quote");
      }
      out += unescapeDouble(next);
      i += 2;
      continue;
    }
    if (ch === quote) {
      const after = rest.slice(i + 1).trim();
      if (after !== "" && !after.startsWith("#")) {
        throw malformed(path, line, "unexpected trailing text");
      }
      return out;
    }
    out += ch;
    i += 1;
  }
  throw malformed(path, line, "unclosed quote");
}

function unescapeDouble(ch: string): string {
  switch (ch) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return ch;
  }
}

function malformed(path: string, line: number, reason: string): PrivateEnvFileError {
  return new PrivateEnvFileError(
    "ENV_FILE_MALFORMED",
    `env file malformed at ${path}:${line}: ${reason}`,
    path,
    line,
  );
}

function isFsCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
