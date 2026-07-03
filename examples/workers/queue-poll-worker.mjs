#!/usr/bin/env node
/**
 * Minimal queue_poll worker — polls Murrmure hub for task offers and completes them.
 * Usage: MURRMURE_HUB_URL=… MURRMURE_TOKEN=… node examples/workers/queue-poll-worker.mjs --executor remote-build
 */
const hubUrl = process.env.MURRMURE_HUB_URL ?? "http://127.0.0.1:8787";
const token = process.env.MURRMURE_TOKEN;
const executorArg = process.argv.find((a) => a.startsWith("--executor="));
const executorId = executorArg?.slice("--executor=".length) ?? process.argv[process.argv.indexOf("--executor") + 1];

if (!token) {
  console.error("Set MURRMURE_TOKEN to a grant with executor:poll");
  process.exit(1);
}
if (!executorId) {
  console.error("Usage: queue-poll-worker.mjs --executor <executor_id>");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

console.error(`Polling ${hubUrl}/v1/executor/tasks?executor_id=${executorId}`);

for (;;) {
  const res = await fetch(
    `${hubUrl}/v1/executor/tasks?executor_id=${encodeURIComponent(executorId)}`,
    { headers },
  );
  if (!res.ok) {
    console.error("Poll failed", res.status, await res.text());
    await sleep(2000);
    continue;
  }

  const tasks = await res.json();
  if (!Array.isArray(tasks) || tasks.length === 0) continue;

  for (const task of tasks) {
    console.error("Task", task.task_id, task.action_name, task.params);
    const result = { ok: true, echo: task.params };
    const complete = await fetch(`${hubUrl}/v1/executor/tasks/${task.task_id}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ result }),
    });
    if (!complete.ok) {
      console.error("Complete failed", complete.status, await complete.text());
    } else {
      console.error("Completed", task.task_id);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
