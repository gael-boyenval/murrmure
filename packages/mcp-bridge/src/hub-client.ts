export interface CatalogTool {
  name: string;
  description?: string;
  flow_id?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ControlMessage {
  method: string;
  params: Record<string, unknown> & { seq?: number };
}

export interface HandshakeResponse {
  handshake_ack_seq: number;
  messages: ControlMessage[];
  server_tools?: string[];
}

interface HubCallOptions {
  hubUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function summarizeBody(body: unknown): string {
  if (typeof body === "string") {
    return body.slice(0, 300);
  }
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return String(body).slice(0, 300);
  }
}

async function parseJsonBody(response: Response, context: string): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} returned non-JSON (HTTP ${response.status})`);
  }
}

function endpointUrl(hubUrl: string, path: string): string {
  return new URL(path, `${hubUrl.replace(/\/$/, "")}/`).toString();
}

export async function fetchCatalog(options: HubCallOptions): Promise<CatalogTool[]> {
  const fetchFn = options.fetchImpl ?? fetch;
  const response = await fetchFn(endpointUrl(options.hubUrl, "/v1/mcp/catalog"), {
    method: "GET",
    headers: authHeaders(options.token),
  });
  const body = await parseJsonBody(response, "Hub catalog");
  if (!response.ok) {
    throw new Error(`Hub catalog failed (HTTP ${response.status}): ${summarizeBody(body)}`);
  }
  const tools = (body as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) {
    throw new Error("Hub catalog response missing tools array");
  }
  return tools as CatalogTool[];
}

export async function callTool(
  options: HubCallOptions & {
    name: string;
    arguments: Record<string, unknown>;
  },
): Promise<unknown> {
  const fetchFn = options.fetchImpl ?? fetch;
  const response = await fetchFn(endpointUrl(options.hubUrl, "/v1/mcp/tools/call"), {
    method: "POST",
    headers: authHeaders(options.token),
    body: JSON.stringify({
      name: options.name,
      arguments: options.arguments,
    }),
  });
  const body = await parseJsonBody(response, `Tool ${options.name}`);
  if (!response.ok) {
    throw new Error(
      `Tool ${options.name} failed (HTTP ${response.status}): ${summarizeBody(body)}`,
    );
  }
  return (body as { result?: unknown }).result ?? body;
}

export async function performHandshake(
  options: HubCallOptions & {
    clientId: string;
    lastAckSeq: number;
  },
): Promise<HandshakeResponse> {
  const fetchFn = options.fetchImpl ?? fetch;
  const response = await fetchFn(endpointUrl(options.hubUrl, "/v1/mcp/session/handshake"), {
    method: "POST",
    headers: authHeaders(options.token),
    body: JSON.stringify({
      client_id: options.clientId,
      last_ack_seq: options.lastAckSeq,
    }),
  });
  const body = await parseJsonBody(response, "MCP handshake");
  if (!response.ok) {
    throw new Error(`MCP handshake failed (HTTP ${response.status}): ${summarizeBody(body)}`);
  }
  const parsed = body as HandshakeResponse;
  if (!Array.isArray(parsed.messages)) {
    throw new Error("MCP handshake response missing messages array");
  }
  return parsed;
}
