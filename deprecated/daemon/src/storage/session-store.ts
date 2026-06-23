import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  type CreateCommentData,
  type CreateReplyData,
  type CreateSessionData,
  type PatchCommentData,
  type Comment,
  type SessionJson,
  type SessionSummary,
  SessionJsonSchema,
} from "@studio/review-contracts";
import { REVIEWS_DIR } from "../config";

/** In-memory working copy of every session; disk is the durable source of truth. */
const sessions = new Map<string, SessionJson>();
let lastSessionKey: string | null = null;

function now(): string {
  return new Date().toISOString();
}

function shortId(prefix: string): string {
  return `${prefix}${randomBytes(3).toString("hex")}`;
}

function sessionKey(): string {
  return randomBytes(4).toString("hex");
}

export function sessionDir(key: string): string {
  return join(REVIEWS_DIR, key);
}

export function reviewFilePath(key: string): string {
  return join(sessionDir(key), "session.json");
}

/** Write `session.json` atomically (temp file + rename). */
async function persist(session: SessionJson): Promise<void> {
  session.updated_at = now();
  sessions.set(session.session_key, session);
  await mkdir(sessionDir(session.session_key), { recursive: true });
  const target = reviewFilePath(session.session_key);
  const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(session, null, 2), "utf8");
  await rename(temp, target);
}

/** Load any sessions already on disk so listings survive daemon restarts. */
export async function loadFromDisk(): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(REVIEWS_DIR);
  } catch {
    return;
  }
  for (const key of entries) {
    try {
      const raw = await readFile(reviewFilePath(key), "utf8");
      const session = SessionJsonSchema.parse(JSON.parse(raw));
      sessions.set(session.session_key, session);
    } catch {
      /* skip unreadable/partial session folders */
    }
  }
}

export function getSession(key: string): SessionJson | undefined {
  return sessions.get(key);
}

export function getActiveSession(): SessionJson | undefined {
  if (lastSessionKey && sessions.has(lastSessionKey)) {
    return sessions.get(lastSessionKey);
  }
  return [...sessions.values()].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )[0];
}

export function unresolvedCount(session: SessionJson): number {
  let count = 0;
  for (const thread of Object.values(session.threads)) {
    for (const comment of thread) if (!comment.resolved) count += 1;
  }
  return count;
}

export function summarize(session: SessionJson): SessionSummary {
  return {
    session_key: session.session_key,
    view: session.view,
    review_round: session.review_round,
    round_state: session.round_state,
    unresolved: unresolvedCount(session),
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

export function listSummaries(): SessionSummary[] {
  return [...sessions.values()]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(summarize);
}

export async function createSession(
  input: CreateSessionData,
): Promise<SessionJson> {
  const key = sessionKey();
  const timestamp = now();
  const session: SessionJson = {
    protocol_version: "1",
    session_key: key,
    view: input.view,
    review_round: 1,
    round_state: "collecting_feedback",
    convergence: { mode: "unresolved_zero" },
    target: { view: input.view, url: input.url, proxy_port: null },
    threads: {},
    created_at: timestamp,
    updated_at: timestamp,
  };
  await persist(session);
  lastSessionKey = key;
  return session;
}

function requireSession(key: string): SessionJson {
  const session = sessions.get(key);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  return session;
}

export async function addComment(
  key: string,
  input: CreateCommentData,
): Promise<{ session: SessionJson; comment: Comment }> {
  const session = requireSession(key);
  const comment: Comment = {
    id: shortId("c_"),
    scope: input.scope,
    body: input.body,
    author: input.author,
    resolved: false,
    anchor: input.anchor ?? null,
    replies: [],
    created_at: now(),
  };
  (session.threads[input.thread] ??= []).push(comment);
  await persist(session);
  return { session, comment };
}

function findComment(
  session: SessionJson,
  id: string,
): Comment | undefined {
  for (const thread of Object.values(session.threads)) {
    const found = thread.find((comment) => comment.id === id);
    if (found) return found;
  }
  return undefined;
}

export async function addReply(
  key: string,
  commentId: string,
  input: CreateReplyData,
): Promise<SessionJson> {
  const session = requireSession(key);
  const comment = findComment(session, commentId);
  if (!comment) throw new Error("COMMENT_NOT_FOUND");
  comment.replies.push({
    id: shortId("r_"),
    author: input.author,
    body: input.body,
    created_at: now(),
  });
  comment.updated_at = now();
  await persist(session);
  return session;
}

export async function patchComment(
  key: string,
  commentId: string,
  input: PatchCommentData,
): Promise<SessionJson> {
  const session = requireSession(key);
  const comment = findComment(session, commentId);
  if (!comment) throw new Error("COMMENT_NOT_FOUND");
  if (input.resolved !== undefined) comment.resolved = input.resolved;
  if (input.body !== undefined) comment.body = input.body;
  comment.updated_at = now();
  await persist(session);
  return session;
}

/** Human finished a round: converge if clean, else hand off to the agent. */
export async function finishRound(
  key: string,
): Promise<{ session: SessionJson; approved: boolean; unresolved: number }> {
  const session = requireSession(key);
  const unresolved = unresolvedCount(session);
  const approved = unresolved === 0;
  session.round_state = approved ? "converged" : "awaiting_agent";
  await persist(session);
  return { session, approved, unresolved };
}

/**
 * Agent signalled it finished applying fixes. Idempotent: only advances when a
 * round is actually awaiting the agent, so review-cycle retries are safe.
 */
export async function signalRoundComplete(
  key: string,
): Promise<SessionJson | null> {
  const session = requireSession(key);
  if (session.round_state !== "awaiting_agent") return null;
  session.review_round += 1;
  session.round_state = "collecting_feedback";
  await persist(session);
  return session;
}
