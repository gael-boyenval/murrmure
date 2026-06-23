import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { serve } from "@hono/node-server";
import {
  CreateCommentInputSchema,
  CreateReplyInputSchema,
  CreateSessionInputSchema,
  PatchCommentInputSchema,
  type ReviewSseEvent,
  type SessionJson,
} from "@studio/review-contracts";
import { daemonHost, daemonPort } from "./config";
import { hubs } from "./sse/hub";
import { buildFinishPrompt, buildNextCommand } from "./prompt";
import {
  addComment,
  addReply,
  createSession,
  finishRound,
  getSession,
  listSummaries,
  loadFromDisk,
  patchComment,
  reviewFilePath,
  signalRoundComplete,
  unresolvedCount,
} from "./storage/session-store";

/** Long-poll window. Kept under server idle cap; clients retry. */
const REVIEW_CYCLE_WAIT_MS = 240_000;

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dir, "../../../fixtures");

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

function errorJson(status: number, code: string, message?: string): Response {
  return json({ code, message: message ?? code }, status);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function finishedPayload(session: SessionJson, unresolved: number) {
  const reviewFile = reviewFilePath(session.session_key);
  return {
    status: "finished" as const,
    approved: unresolved === 0,
    session_id: session.session_key,
    review_file: reviewFile,
    round: session.review_round,
    prompt: buildFinishPrompt(session, reviewFile, unresolved),
    next_command: buildNextCommand(session.session_key),
    stats: { unresolved },
  };
}

function publish(key: string, event: ReviewSseEvent): void {
  hubs.get(key).publish(event);
}

async function handleCreateSession(request: Request): Promise<Response> {
  const parsed = CreateSessionInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorJson(400, "INVALID_REQUEST", parsed.error.message);
  const session = await createSession(parsed.data);
  return json(session, 201);
}

async function handleAddComment(key: string, request: Request): Promise<Response> {
  if (!getSession(key)) return errorJson(404, "SESSION_NOT_FOUND");
  const parsed = CreateCommentInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorJson(400, "INVALID_REQUEST", parsed.error.message);
  const { session, comment } = await addComment(key, parsed.data);
  publish(key, { type: "review.item_changed", payload: { sessionKey: key, itemId: comment.id } });
  return json(session, 201);
}

async function handleAddReply(key: string, id: string, request: Request): Promise<Response> {
  if (!getSession(key)) return errorJson(404, "SESSION_NOT_FOUND");
  const parsed = CreateReplyInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorJson(400, "INVALID_REQUEST", parsed.error.message);
  try {
    const session = await addReply(key, id, parsed.data);
    publish(key, { type: "review.item_changed", payload: { sessionKey: key, itemId: id } });
    return json(session);
  } catch {
    return errorJson(404, "COMMENT_NOT_FOUND");
  }
}

async function handlePatchComment(key: string, id: string, request: Request): Promise<Response> {
  if (!getSession(key)) return errorJson(404, "SESSION_NOT_FOUND");
  const parsed = PatchCommentInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorJson(400, "INVALID_REQUEST", parsed.error.message);
  try {
    const session = await patchComment(key, id, parsed.data);
    publish(key, { type: "review.item_changed", payload: { sessionKey: key, itemId: id } });
    return json(session);
  } catch {
    return errorJson(404, "COMMENT_NOT_FOUND");
  }
}

async function handleFinish(key: string): Promise<Response> {
  if (!getSession(key)) return errorJson(404, "SESSION_NOT_FOUND");
  const { session, approved, unresolved } = await finishRound(key);
  publish(key, {
    type: "review.finish",
    payload: { sessionKey: key, approved, stats: { unresolved } },
  });
  return json(finishedPayload(session, unresolved));
}

async function handleRoundComplete(key: string): Promise<Response> {
  if (!getSession(key)) return errorJson(404, "SESSION_NOT_FOUND");
  const session = await signalRoundComplete(key);
  if (session) {
    publish(key, {
      type: "review.round_start",
      payload: { sessionKey: key, round: session.review_round },
    });
  }
  return json(getSession(key));
}

/**
 * Block until the human clicks Finish. Subscribe before signalling round
 * completion (Crit ordering) so a fast finish is never missed. Returns a
 * `timeout` sentinel when the poll window elapses; callers reissue the request.
 */
async function handleReviewCycle(key: string, signal: AbortSignal): Promise<Response> {
  if (!getSession(key)) return errorJson(404, "SESSION_NOT_FOUND");
  const hub = hubs.get(key);
  const finishWait = hub.waitFor(
    (event) => event.type === "review.finish" || event.type === "server-shutdown",
    signal,
  );

  const advanced = await signalRoundComplete(key);
  if (advanced) {
    publish(key, {
      type: "review.round_start",
      payload: { sessionKey: key, round: advanced.review_round },
    });
  }

  const current = getSession(key)!;
  if (current.round_state === "converged") {
    return json(finishedPayload(current, unresolvedCount(current)));
  }

  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), REVIEW_CYCLE_WAIT_MS),
  );
  const result = await Promise.race([finishWait, timeout]);

  if (result === "timeout") return json({ status: "timeout" });
  if (result === null) return new Response(null, { status: 499, headers: corsHeaders() });

  if (result.type === "server-shutdown") {
    return json(
      {
        status: "shutdown",
        approved: false,
        session_id: key,
        review_file: reviewFilePath(key),
        round: current.review_round,
        prompt: "Studio daemon shut down before the review finished.",
        next_command: buildNextCommand(key),
      },
      503,
    );
  }

  const finished = getSession(key)!;
  return json(finishedPayload(finished, unresolvedCount(finished)));
}

function handleEvents(key: string, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const hub = hubs.get(key);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ReviewSseEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };
      send({ type: "ready", payload: { sessionKey: key } });
      const unsubscribe = hub.subscribe(send);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* ignore */
        }
      }, 15_000);
      signal.addEventListener(
        "abort",
        () => {
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        { once: true },
      );
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...corsHeaders(),
    },
  });
}

function fixtureContentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function handleFixtures(pathname: string): Promise<Response> {
  const relative = decodeURIComponent(pathname.slice("/fixtures/".length));
  if (relative.includes("..")) return new Response("Forbidden", { status: 403 });
  let filePath = join(FIXTURES_DIR, relative);
  if (pathname.endsWith("/") || !relative.includes(".")) {
    filePath = join(filePath, "index.html");
  }
  try {
    await access(filePath, constants.F_OK);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const data = await readFile(filePath);
  return new Response(data, {
    headers: {
      "content-type": fixtureContentType(filePath),
      ...corsHeaders(),
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (pathname.startsWith("/fixtures/")) {
    if (method !== "GET") return errorJson(405, "INVALID_REQUEST", "Method not allowed");
    return handleFixtures(pathname);
  }

  if (pathname === "/api/health") return json({ status: "ok" });

  if (pathname === "/api/sessions") {
    if (method === "GET") return json(listSummaries());
    if (method === "POST") return handleCreateSession(request);
    return errorJson(405, "INVALID_REQUEST", "Method not allowed");
  }

  const segments = pathname.split("/").filter(Boolean); // ["api","sessions",key,...]
  if (segments[0] === "api" && segments[1] === "sessions" && segments[2]) {
    const key = segments[2];
    const tail = segments.slice(3);

    if (tail.length === 0) {
      if (method === "GET") {
        const session = getSession(key);
        return session ? json(session) : errorJson(404, "SESSION_NOT_FOUND");
      }
      return errorJson(405, "INVALID_REQUEST", "Method not allowed");
    }

    if (tail[0] === "comments" && tail.length === 1 && method === "POST") {
      return handleAddComment(key, request);
    }
    if (tail[0] === "comments" && tail[1] && tail.length === 2 && method === "PATCH") {
      return handlePatchComment(key, tail[1], request);
    }
    if (
      tail[0] === "comments" &&
      tail[1] &&
      tail[2] === "replies" &&
      tail.length === 3 &&
      method === "POST"
    ) {
      return handleAddReply(key, tail[1], request);
    }
    if (tail[0] === "finish" && method === "POST") return handleFinish(key);
    if (tail[0] === "round-complete" && method === "POST") return handleRoundComplete(key);
    if (tail[0] === "review-cycle" && method === "POST") {
      return handleReviewCycle(key, request.signal);
    }
    if (tail[0] === "events" && method === "GET") {
      return handleEvents(key, request.signal);
    }
  }

  return errorJson(404, "INVALID_REQUEST", "Not found");
}

export interface StartServerOptions {
  host?: string;
  port?: number;
}

export async function startServer(options: StartServerOptions = {}) {
  await loadFromDisk();
  const host = options.host ?? daemonHost();
  const port = options.port ?? daemonPort();

  const server = serve({
    fetch: (request) => route(request),
    hostname: host,
    port,
  });

  server.requestTimeout = 300_000;
  server.headersTimeout = 300_000;

  const shutdown = () => {
    hubs.broadcastShutdown();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
