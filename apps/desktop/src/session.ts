export const DEFAULT_BOOTSTRAP_TOKEN_BARE = "01JBOOTSTRAPTOKEN00000001";

export function toBearerToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    throw new Error("Bootstrap token is empty.");
  }
  return trimmed.startsWith("tok_") ? trimmed : `tok_${trimmed}`;
}

export async function ensureBootstrapSessionToken(options: {
  hubUrl: string;
  bootstrapToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = toBearerToken(options.bootstrapToken ?? DEFAULT_BOOTSTRAP_TOKEN_BARE);
  const response = await fetchImpl(`${options.hubUrl.replace(/\/$/, "")}/v1/auth/whoami`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Bootstrap whoami failed with ${response.status}${body ? `: ${body}` : ""}`,
    );
  }
  return token;
}

export function createSessionInjectionScript(token: string, hubUrl: string): string {
  const serializedToken = JSON.stringify(token);
  const serializedHubUrl = JSON.stringify(hubUrl.replace(/\/$/, ""));
  return `(() => {
  const token = ${serializedToken};
  const hubUrl = ${serializedHubUrl};
  localStorage.setItem("murrmure_token", token);
  localStorage.setItem("murrmure_hub_url", hubUrl);
  const setupDone = localStorage.getItem("murrmure_setup_complete") === "1";
  if (window.location.pathname === "/" || window.location.pathname === "/connect") {
    window.location.replace(setupDone ? "/configure" : "/setup");
  }
})();`;
}
