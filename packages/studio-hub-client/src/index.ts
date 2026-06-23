import type { HubClientOptions, HubClient } from "./runtime.js";
import { createRuntimeClient } from "./runtime.js";
import { createConfigClient } from "./config.js";

export * from "./runtime.js";
export * from "./config.js";

export function createHubClient(opts: HubClientOptions): HubClient {
  const base = opts.baseUrl.replace(/\/$/, "");
  const headers = (): Record<string, string> => ({
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
  });

  const runtime = createRuntimeClient(base, headers);
  const config = createConfigClient(base, headers);

  return {
    ...runtime,
    ...config,
    spaces: {
      get: runtime.spaces.get,
      ...config.spaces,
    },
  };
}
