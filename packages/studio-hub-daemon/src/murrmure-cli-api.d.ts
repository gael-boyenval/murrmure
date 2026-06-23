declare module "@murrmure/cli/api" {
  export function computeBundleDigest(stageDir: string): Promise<string>;
  export function computeFileDigest(filePath: string): Promise<string>;
  export function buildFlowRoot(
    dir: string,
    opts?: { outDir?: string },
  ): Promise<{ ok: boolean; stageDir?: string; bundleDigest?: string; errors?: unknown[] }>;
  export function initFlow(id: string, dir: string, opts?: Record<string, unknown>): void;
}
