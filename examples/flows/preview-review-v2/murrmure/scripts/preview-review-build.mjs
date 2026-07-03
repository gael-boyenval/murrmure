// Role: build step — reads MURRMURE_INPUT + invoke params; emits preview_url JSON.
const input = JSON.parse(process.env.MURRMURE_INPUT ?? "{}");
const params = JSON.parse(process.env.MURRMURE_INVOKE_PARAMS ?? "{}");

const previewUrl = params.preview_url ?? input.preview_url ?? "http://localhost:5173";
const feedback = params.feedback ?? null;
const feedbackApplied =
  feedback != null &&
  (Array.isArray(feedback) ? feedback.length > 0 : String(feedback).trim() !== "");

process.stdout.write(
  JSON.stringify({
    preview_url: previewUrl,
    feedback_applied: feedbackApplied,
    built_at: new Date().toISOString(),
  }),
);
