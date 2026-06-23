import {
  STUDIO_API_ROUTES,
  type CreateCommentInput,
  type CreateReplyInput,
  type CreateSessionInput,
  type PatchCommentInput,
  type ReviewCycleResponse,
  type ReviewSseEvent,
  type SessionJson,
  type SessionSummary,
} from "@studio/review-contracts";

export interface StudioClientOptions {
  /** Daemon origin. Use "" for same-origin (e.g. behind the Vite dev proxy). */
  baseUrl?: string;
  fetch?: typeof fetch;
  EventSource?: typeof EventSource;
}

export interface StudioClient {
  readonly baseUrl: string;
  health(): Promise<{ status: string }>;
  sessions: {
    list(): Promise<SessionSummary[]>;
    create(input: CreateSessionInput): Promise<SessionJson>;
    get(key: string): Promise<SessionJson>;
    finish(key: string): Promise<ReviewCycleResponse>;
    reviewCycle(key: string): Promise<ReviewCycleResponse | { status: "timeout" }>;
    subscribeEvents(
      key: string,
      onEvent: (event: ReviewSseEvent) => void,
      onError?: (error: Event) => void,
    ): () => void;
  };
  comments: {
    create(key: string, input: CreateCommentInput): Promise<SessionJson>;
    reply(key: string, id: string, input: CreateReplyInput): Promise<SessionJson>;
    patch(key: string, id: string, input: PatchCommentInput): Promise<SessionJson>;
  };
}

export function createStudioClient(options: StudioClientOptions = {}): StudioClient {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;
  const EventSourceImpl = options.EventSource ?? globalThis.EventSource;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await doFetch(baseUrl + path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Studio ${init?.method ?? "GET"} ${path} failed: ${response.status} ${detail}`,
      );
    }
    return (await response.json()) as T;
  }

  return {
    baseUrl,
    health: () => request<{ status: string }>(STUDIO_API_ROUTES.health),
    sessions: {
      list: () => request<SessionSummary[]>(STUDIO_API_ROUTES.sessions),
      create: (input) =>
        request<SessionJson>(STUDIO_API_ROUTES.sessions, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      get: (key) => request<SessionJson>(STUDIO_API_ROUTES.session(key)),
      finish: (key) =>
        request<ReviewCycleResponse>(STUDIO_API_ROUTES.finish(key), {
          method: "POST",
        }),
      reviewCycle: (key) =>
        request<ReviewCycleResponse | { status: "timeout" }>(
          STUDIO_API_ROUTES.reviewCycle(key),
          { method: "POST" },
        ),
      subscribeEvents: (key, onEvent, onError) => {
        const source = new EventSourceImpl(baseUrl + STUDIO_API_ROUTES.events(key));
        source.onmessage = (event: MessageEvent) => {
          try {
            onEvent(JSON.parse(event.data) as ReviewSseEvent);
          } catch {
            /* ignore heartbeats and malformed frames */
          }
        };
        if (onError) source.onerror = onError;
        return () => source.close();
      },
    },
    comments: {
      create: (key, input) =>
        request<SessionJson>(STUDIO_API_ROUTES.comments(key), {
          method: "POST",
          body: JSON.stringify(input),
        }),
      reply: (key, id, input) =>
        request<SessionJson>(STUDIO_API_ROUTES.replies(key, id), {
          method: "POST",
          body: JSON.stringify(input),
        }),
      patch: (key, id, input) =>
        request<SessionJson>(STUDIO_API_ROUTES.comment(key, id), {
          method: "PATCH",
          body: JSON.stringify(input),
        }),
    },
  };
}
