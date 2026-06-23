export interface FlowHostContextPublic {
  spaceId: string;
  instanceId: string;
  hubUrl: string;
  canvasRoute: string;
  flowId: string;
  version: string;
}

export interface FlowHostContext extends FlowHostContextPublic {
  postMessage: (msg: unknown) => void;
  hubFetch: (path: string, init?: RequestInit) => Promise<Response>;
}
