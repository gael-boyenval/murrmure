import { useState } from "react";
import type { Comment, SessionJson } from "@studio/review-contracts";
import { client } from "../api";

interface CommentPanelProps {
  sessionKey: string;
  session: SessionJson;
  onChange: () => void;
}

export function CommentPanel({ sessionKey, session, onChange }: CommentPanelProps) {
  const [draft, setDraft] = useState("");
  const threads = Object.entries(session.threads);
  const total = threads.reduce((sum, [, list]) => sum + list.length, 0);

  const addComment = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await client.comments.create(sessionKey, { thread: "/", body, author: "Human" });
    onChange();
  };

  return (
    <div className="comments">
      <div className="comments__header">
        <h2>Comments</h2>
        <span className="muted">{total}</span>
      </div>

      <div className="comments__list">
        {threads.length === 0 && (
          <p className="muted">No comments yet. Add feedback below.</p>
        )}
        {threads.map(([thread, list]) => (
          <div key={thread} className="thread">
            <div className="thread__key muted">{thread}</div>
            {list.map((comment) => (
              <CommentItem
                key={comment.id}
                sessionKey={sessionKey}
                comment={comment}
                onChange={onChange}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Leave feedback for the agent…"
          rows={3}
        />
        <button className="btn" onClick={addComment} disabled={!draft.trim()}>
          Add comment
        </button>
      </div>
    </div>
  );
}

interface CommentItemProps {
  sessionKey: string;
  comment: Comment;
  onChange: () => void;
}

function CommentItem({ sessionKey, comment, onChange }: CommentItemProps) {
  const [reply, setReply] = useState("");

  const toggleResolved = async () => {
    await client.comments.patch(sessionKey, comment.id, { resolved: !comment.resolved });
    onChange();
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body) return;
    setReply("");
    await client.comments.reply(sessionKey, comment.id, { author: "Human", body });
    onChange();
  };

  return (
    <article className={`comment ${comment.resolved ? "comment--resolved" : ""}`}>
      <div className="comment__head">
        <span className="comment__author">{comment.author}</span>
        <code className="comment__id">{comment.id}</code>
      </div>
      <p className="comment__body">{comment.body}</p>

      {comment.replies.length > 0 && (
        <div className="comment__replies">
          {comment.replies.map((r) => (
            <div key={r.id} className="reply">
              <span className="comment__author">{r.author}</span>
              <span>{r.body}</span>
            </div>
          ))}
        </div>
      )}

      <div className="comment__actions">
        <button className="btn btn--ghost" onClick={toggleResolved}>
          {comment.resolved ? "Unresolve" : "Resolve"}
        </button>
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Reply…"
          onKeyDown={(event) => {
            if (event.key === "Enter") sendReply();
          }}
        />
      </div>
    </article>
  );
}
