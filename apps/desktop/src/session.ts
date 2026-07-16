export const DEFAULT_BOOTSTRAP_TOKEN_BARE = "01JBOOTSTRAPTOKEN00000001";

export function toBearerToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    throw new Error("Bootstrap token is empty.");
  }
  return trimmed.startsWith("tok_") ? trimmed : `tok_${trimmed}`;
}

export interface BootstrapSession {
  token: string;
  actor_id: string;
}

export async function ensureBootstrapSession(options: {
  hubUrl: string;
  bootstrapToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<BootstrapSession> {
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

  const whoami = (await response.json()) as { actor_id?: string };
  if (!whoami.actor_id) {
    throw new Error("Bootstrap whoami response missing actor_id.");
  }

  return { token, actor_id: whoami.actor_id };
}

export async function ensureBootstrapSessionToken(options: {
  hubUrl: string;
  bootstrapToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const session = await ensureBootstrapSession(options);
  return session.token;
}

export function createSessionInjectionScript(token: string, hubUrl: string): string {
  const serializedToken = JSON.stringify(token);
  const serializedHubUrl = JSON.stringify(hubUrl.replace(/\/$/, ""));
  return `(() => {
  const token = ${serializedToken};
  const hubUrl = ${serializedHubUrl};
  localStorage.setItem("murrmure_token", token);
  localStorage.setItem("murrmure_hub_url", hubUrl);
  document.cookie = "murrmure_token=" + encodeURIComponent(token) + "; Path=/; SameSite=Lax";
  if (window.location.pathname === "/" || window.location.pathname === "/connect") {
    window.location.replace("/spaces/new");
  }
})();`;
}
