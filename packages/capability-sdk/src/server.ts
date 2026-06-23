export interface HubBridgeClient {
  execute(cmd: Record<string, unknown>): Promise<{ outcome: string; body?: Record<string, unknown>; http_semantic?: number }>;
  query(kind: string, args?: Record<string, unknown>): Promise<unknown>;
  getInstallConfig(): Record<string, unknown>;
  getPrincipal(): Promise<{ actorId: string; spaceId: string; tokenId: string }>;
}

export interface CapabilityServerContext {
  spaceId: string;
  installId: string;
  packageId: string;
  version: string;
  routesPrefix: string;
  contractRefId: string;
  hub: HubBridgeClient;
  getInstallConfig(): Record<string, unknown>;
}

export type HonoLike = {
  get: (path: string, handler: (...args: unknown[]) => unknown) => void;
  post: (path: string, handler: (...args: unknown[]) => unknown) => void;
  route: (path: string, ...args: unknown[]) => void;
};

export type MountRoutesFn = (app: HonoLike, ctx: CapabilityServerContext) => void;
