// Role: build step script — reads MURRMURE_INPUT + MURRMURE_INVOKE_PARAMS; emits preview_url JSON.
const input = JSON.parse(process.env.MURRMURE_INPUT ?? "{}");
const params = JSON.parse(process.env.MURRMURE_INVOKE_PARAMS ?? "{}");

const previewUrl = params.preview_url ?? input.preview_url ?? "http://localhost:3000";
const feedback = params.feedback ?? null;

process.stdout.write(
  JSON.stringify({
    preview_url: previewUrl,
    feedback_applied: feedback != null,
    built_at: new Date().toISOString(),
  }),
);
