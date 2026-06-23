/**
 * Host-bridge client injected into capability worker context by capability-worker-entry.js.
 * Plain JavaScript — loaded by the bare node worker entry, not bundled into mount.mjs.
 */

export function createHubBridge(opts) {
  const { bridgeUrl, workerToken, getRequestHeaders } = opts;

  async function invoke(body) {
    const headers = {
      "Content-Type": "application/json",
      "X-Studio-Worker-Token": workerToken,
    };
    const reqHeaders = getRequestHeaders();
    const caller =
      reqHeaders["x-studio-caller-token"] ??
      (reqHeaders.authorization ? reqHeaders.authorization.replace(/^Bearer /, "") : undefined);
    if (caller) headers["X-Studio-Caller-Token"] = caller;
    if (reqHeaders["x-studio-internal-space"]) {
      headers["X-Studio-Internal-Space"] = reqHeaders["x-studio-internal-space"];
    }

    const res = await fetch(`${bridgeUrl}/internal/worker-bridge/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message ?? data.code ?? "bridge_invoke_failed");
      err.code = data.code;
      err.body = data;
      throw err;
    }
    return data;
  }

  return {
    async execute(cmd) {
      return invoke({ op: "execute", cmd });
    },
    async query(kind, args) {
      const result = await invoke({ op: "query", kind, args: args ?? {} });
      return result.data;
    },
    getInstallConfig() {
      try {
        return JSON.parse(process.env.STUDIO_INSTALL_CONFIG || "{}");
      } catch {
        return {};
      }
    },
    async getPrincipal() {
      return invoke({ op: "principal" });
    },
  };
}
