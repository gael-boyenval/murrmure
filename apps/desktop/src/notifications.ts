export interface DesktopOutOfShellPayload {
  actor_id: string;
  kind: "gate" | "run_failed";
  title: string;
  body?: string;
  deep_link: string;
  gate_id?: string;
  run_id?: string;
  session_id?: string;
  space_id?: string;
}

export interface DesktopNotificationBridgeOptions {
  hubUrl: string;
  token: string;
  /** Only show notifications targeted at this actor (from bootstrap whoami). */
  currentActorId: string;
  /** When true, skip OS notifications (shell is focused). */
  isShellFocused?: () => boolean;
  showNotification: (options: {
    title: string;
    body?: string;
    subtitle?: string;
    silent?: boolean;
    deepLink?: string;
  }) => void;
  navigateToDeepLink: (deepLink: string) => void;
  fetchImpl?: typeof fetch;
}

function parseSseChunk(buffer: string): { event?: string; data?: string; rest: string } {
  const lines = buffer.split("\n");
  let event: string | undefined;
  let data: string | undefined;
  let consumed = 0;
  for (const line of lines) {
    consumed += line.length + 1;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data = line.slice(5).trim();
    } else if (line === "") {
      break;
    }
  }
  return { event, data, rest: buffer.slice(consumed) };
}

export function shellRouteFromMurrmureDeepLink(deepLink: string): string {
  const url = new URL(deepLink);
  if (url.protocol !== "murrmure:") return "/";
  const path = `${url.hostname}${url.pathname}`.replace(/^\/+/, "");
  if (path.startsWith("runs/")) {
    const runId = path.slice("runs/".length);
    const gate = url.searchParams.get("gate");
    return gate ? `/runs/${runId}?gate=${encodeURIComponent(gate)}` : `/runs/${runId}`;
  }
  if (path === "notifications") return "/notifications";
  return `/${path}`;
}

export async function subscribeDesktopOutOfShellNotifications(
  options: DesktopNotificationBridgeOptions,
): Promise<() => void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.hubUrl.replace(/\/$/, "");
  const auth = {
    Authorization: `Bearer ${options.token}`,
    "Content-Type": "application/json",
  };

  const ticketRes = await fetchImpl(`${base}/v1/auth/sse-ticket`, { method: "POST", headers: auth });
  if (!ticketRes.ok) {
    throw new Error(`SSE ticket failed: ${ticketRes.status}`);
  }
  const { ticket } = (await ticketRes.json()) as { ticket: string };

  const controller = new AbortController();
  const res = await fetchImpl(`${base}/v1/journal/subscribe?ticket=${encodeURIComponent(ticket)}`, {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`SSE subscribe failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const pump = async () => {
    while (!controller.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (buffer.includes("\n\n")) {
        const idx = buffer.indexOf("\n\n");
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const { event, data } = parseSseChunk(chunk + "\n");
        if (event !== "out_of_shell.desktop" || !data) continue;
        let payload: DesktopOutOfShellPayload;
        try {
          payload = JSON.parse(data) as DesktopOutOfShellPayload;
        } catch {
          continue;
        }
        if (payload.actor_id !== options.currentActorId) continue;
        if (options.isShellFocused?.()) continue;
        // Electrobun showNotification has no click/URL hook — pre-navigate the shell
        // so restoring the window lands on the deep-link route (open-url still handles clicks).
        options.navigateToDeepLink(payload.deep_link);
        options.showNotification({
          title: payload.title,
          body: payload.body,
          subtitle: payload.kind === "gate" ? "Approval needed" : "Run failed",
          deepLink: payload.deep_link,
        });
      }
    }
  };

  void pump().catch(() => undefined);

  return () => controller.abort();
}

export function handleMurrmureOpenUrl(
  url: string,
  navigate: (shellRoute: string) => void,
): boolean {
  if (!url.startsWith("murrmure://")) return false;
  navigate(shellRouteFromMurrmureDeepLink(url));
  return true;
}
