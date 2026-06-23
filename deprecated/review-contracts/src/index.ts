/**
 * Self-contained stub for the legacy US-001 review contracts package.
 * The original `packages/review-contracts` was removed during the debundle;
 * this copy keeps `deprecated/` buildable without the active workspace.
 */
import { z } from "zod";

export const ViewSchema = z.enum(["app", "components", "foundations"]);
export type View = z.infer<typeof ViewSchema>;

const CommentSchema = z.object({
  id: z.string(),
  scope: z.string(),
  body: z.string(),
  author: z.string(),
  resolved: z.boolean(),
  anchor: z.unknown().nullable().optional(),
  replies: z.array(
    z.object({
      id: z.string(),
      author: z.string(),
      body: z.string(),
      created_at: z.string(),
    }),
  ),
  created_at: z.string(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const SessionJsonSchema = z.object({
  protocol_version: z.literal("1"),
  session_key: z.string(),
  view: ViewSchema,
  review_round: z.number(),
  round_state: z.string(),
  convergence: z.object({ mode: z.string() }),
  target: z.object({
    view: ViewSchema,
    url: z.string().optional(),
    proxy_port: z.number().nullable().optional(),
  }),
  threads: z.record(z.string(), z.array(CommentSchema)),
  created_at: z.string(),
  updated_at: z.string(),
});
export type SessionJson = z.infer<typeof SessionJsonSchema>;

export type SessionSummary = {
  session_key: string;
  view: View;
  review_round: number;
  round_state: string;
  unresolved: number;
  created_at: string;
  updated_at: string;
};

export const CreateSessionInputSchema = z.object({
  view: ViewSchema,
  url: z.string().optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
export type CreateSessionData = CreateSessionInput;

export const CreateCommentInputSchema = z.object({
  thread: z.string(),
  scope: z.string(),
  body: z.string(),
  author: z.string(),
  anchor: z.unknown().nullable().optional(),
});
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;
export type CreateCommentData = CreateCommentInput;

export const CreateReplyInputSchema = z.object({
  author: z.string(),
  body: z.string(),
});
export type CreateReplyInput = z.infer<typeof CreateReplyInputSchema>;
export type CreateReplyData = CreateReplyInput;

export const PatchCommentInputSchema = z.object({
  resolved: z.boolean().optional(),
  body: z.string().optional(),
});
export type PatchCommentInput = z.infer<typeof PatchCommentInputSchema>;
export type PatchCommentData = PatchCommentInput;

export type ReviewCycleResponse = {
  status: "finished" | "timeout";
  approved?: boolean;
  session_id?: string;
  review_file?: string;
  round?: number;
  prompt?: string;
  next_command?: string;
  stats?: { unresolved: number };
};

export type ReviewSseEvent =
  | { type: "comment.added"; comment: Comment; session_key: string }
  | { type: "comment.patched"; comment: Comment; session_key: string }
  | { type: "round.complete"; session_key: string }
  | { type: "heartbeat" };

export const STUDIO_API_ROUTES = {
  health: "/api/health",
  sessions: "/api/sessions",
  session: (key: string) => `/api/sessions/${key}`,
  finish: (key: string) => `/api/sessions/${key}/finish`,
  reviewCycle: (key: string) => `/api/sessions/${key}/review-cycle`,
  events: (key: string) => `/api/sessions/${key}/events`,
  comments: (key: string) => `/api/sessions/${key}/comments`,
  comment: (key: string, id: string) => `/api/sessions/${key}/comments/${id}`,
  replies: (key: string, id: string) => `/api/sessions/${key}/comments/${id}/replies`,
} as const;

export const CreateReviewSessionInputShape = {
  view: ViewSchema.optional(),
  url: z.string().optional(),
};

export const GetSessionInputShape = {
  session_key: z.string().optional(),
};

export const WaitForReviewInputShape = {
  session_key: z.string(),
};
