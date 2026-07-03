// Role: hello invoke script — reads MURRMURE_INPUT and prints a greeting JSON payload.
const input = JSON.parse(process.env.MURRMURE_INPUT ?? "{}");

process.stdout.write(
  JSON.stringify({
    message: `Hello from ${process.env.MURRMURE_ACTION ?? "action"}`,
    input,
    at: new Date().toISOString(),
  }),
);
