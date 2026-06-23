export interface CapabilityHostContextPublic {
  spaceId: string;
  instanceId: string;
  hubUrl: string;
  canvasRoute: string;
  packageId: string;
  version: string;
}

export interface CapabilityHostContext extends CapabilityHostContextPublic {
  postMessage: (msg: unknown) => void;
  hubFetch: (path: string, init?: RequestInit) => Promise<Response>;
}
