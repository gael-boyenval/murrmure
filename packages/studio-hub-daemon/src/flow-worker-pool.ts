import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ulid } from "ulid";

const __dir = fileURLToPath(new URL(".", import.meta.url));

export interface WorkerHandle {
  packageId: string;
  digest: string;
  port: number;
  routesPrefix: string;
  process: ChildProcess;
  workerToken: string;
  intentionalKill: boolean;
}

export type WorkerExitHandler = (info: {
  packageId: string;
  digest: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}) => void | Promise<void>;

export interface WorkerAuth {
  packageId: string;
  digest: string;
  spaceId: string;
  installId: string;
  contractRefId: string;
  version: string;
  config: Record<string, unknown>;
}

/**
 * Build a minimal environment for a flow worker. Flow code is untrusted, so it
 * must not inherit the hub's full process environment (which may carry API keys,
 * tokens, or cloud credentials). Only a small host allowlist plus explicit
 * MURRMURE_* identity vars are forwarded.
 */
export function sanitizedWorkerEnv(murrmure: Record<string, string>): NodeJS.ProcessEnv {
  const allow = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SystemRoot", "TEMP", "TMP"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allow) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...murrmure };
}

export class FlowWorkerPool {
  private readonly workers = new Map<string, WorkerHandle>();
  private readonly tokens = new Map<string, WorkerAuth>();
  private exitHandler?: WorkerExitHandler;

  setExitHandler(handler: WorkerExitHandler): void {
    this.exitHandler = handler;
  }

  private key(packageId: string, digest: string): string {
    return `${packageId}:${digest}`;
  }

  validateToken(token: string): WorkerAuth | undefined {
    return this.tokens.get(token);
  }

  getToken(packageId: string, digest: string): string | undefined {
    return this.workers.get(this.key(packageId, digest))?.workerToken;
  }

  async spawn(opts: {
    packageId: string;
    digest: string;
    blobPath: string;
    routesPrefix: string;
    spaceId: string;
    installId: string;
    contractRefId: string;
    version: string;
    bridgePort: number;
    installConfig?: Record<string, unknown>;
  }): Promise<WorkerHandle> {
    const k = this.key(opts.packageId, opts.digest);
    const existing = this.workers.get(k);
    if (existing) return existing;

    const port = 18000 + Math.floor(Math.random() * 2000);
    const workerToken = ulid();
    const workerEntry = join(__dir, "capability-worker-entry.js");
    const proc = spawn(
      process.execPath,
      [
        workerEntry,
        "--port",
        String(port),
        "--bundle",
        opts.blobPath,
        "--prefix",
        opts.routesPrefix,
      ],
      {
        env: sanitizedWorkerEnv({
          MURRMURE_SPACE_ID: opts.spaceId,
          MURRMURE_INSTALL_ID: opts.installId,
          MURRMURE_FLOW_ID: opts.packageId,
          MURRMURE_VERSION: opts.version,
          MURRMURE_CONTRACT_REF_ID: opts.contractRefId,
          MURRMURE_WORKER_TOKEN: workerToken,
          MURRMURE_BRIDGE_PORT: String(opts.bridgePort),
          MURRMURE_INSTALL_CONFIG: JSON.stringify(opts.installConfig ?? {}),
        }),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker start timeout")), 5000);
      proc.stdout?.once("data", (buf) => {
        if (String(buf).includes("ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
      proc.on("error", reject);
      proc.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Worker exited before ready (${code})`));
      });
    });

    const handle: WorkerHandle = {
      packageId: opts.packageId,
      digest: opts.digest,
      port,
      routesPrefix: opts.routesPrefix,
      process: proc,
      workerToken,
      intentionalKill: false,
    };
    this.workers.set(k, handle);
    this.tokens.set(workerToken, {
      packageId: opts.packageId,
      digest: opts.digest,
      spaceId: opts.spaceId,
      installId: opts.installId,
      contractRefId: opts.contractRefId,
      version: opts.version,
      config: opts.installConfig ?? {},
    });

    proc.on("exit", (exitCode, signal) => {
      const current = this.workers.get(k);
      if (!current) return;
      this.tokens.delete(current.workerToken);
      this.workers.delete(k);
      if (current.intentionalKill) return;
      void this.exitHandler?.({
        packageId: opts.packageId,
        digest: opts.digest,
        exitCode,
        signal,
      });
    });

    return handle;
  }

  get(packageId: string, digest: string): WorkerHandle | undefined {
    return this.workers.get(this.key(packageId, digest));
  }

  kill(packageId: string, digest: string): void {
    const k = this.key(packageId, digest);
    const w = this.workers.get(k);
    if (w) {
      w.intentionalKill = true;
      this.tokens.delete(w.workerToken);
      w.process.kill();
      this.workers.delete(k);
    }
  }

  killAll(): void {
    for (const w of this.workers.values()) {
      w.intentionalKill = true;
      this.tokens.delete(w.workerToken);
      w.process.kill();
    }
    this.workers.clear();
  }
}
