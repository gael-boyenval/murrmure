import { defineCommand } from "citty";
import { resolveHubAuth } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { printErr } from "../../lib/output.js";

export const workerPollCommand = defineCommand({
  meta: {
    name: "poll",
    description: "Long-poll hub for queue_poll task offers (Requires: executor:poll grant)",
  },
  args: {
    ...globalArgs,
    executor: {
      type: "string",
      description: "Executor id to poll (must match executors.yaml binding)",
      required: true,
    },
    once: {
      type: "boolean",
      description: "Process one task then exit",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const executorId = String(args.executor);
    const auth = resolveHubAuth({ hubUrl: flags.hubUrl, token: flags.token });
    if ("error" in auth) {
      printErr("AUTH_MISSING", auth.error);
    }

    const headers = {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    };

    console.error(`Polling ${auth.hubUrl}/v1/executor/tasks?executor_id=${executorId} …`);

    for (;;) {
      const res = await fetch(
        `${auth.hubUrl}/v1/executor/tasks?executor_id=${encodeURIComponent(executorId)}`,
        { headers },
      );
      if (!res.ok) {
        const body = await res.text();
        printErr("POLL_FAILED", `Poll returned ${res.status}: ${body}`);
      }

      const tasks = (await res.json()) as Array<{
        task_id: string;
        action_name: string;
        space_id: string;
        params: Record<string, unknown>;
      }>;

      if (!tasks.length) {
        continue;
      }

      for (const task of tasks) {
        console.error(`Task ${task.task_id}: ${task.action_name} (${task.space_id})`);
        const result = { ok: true, echo: task.params };
        const complete = await fetch(
          `${auth.hubUrl}/v1/executor/tasks/${encodeURIComponent(task.task_id)}/complete`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ result }),
          },
        );
        if (!complete.ok) {
          const body = await complete.text();
          printErr("COMPLETE_FAILED", `Complete returned ${complete.status}: ${body}`);
        }
        console.error(`Completed ${task.task_id}`);
      }

      if (args.once) break;
    }
  },
});

export const workerCommand = defineCommand({
  meta: { name: "worker", description: "External queue_poll worker helpers" },
  subCommands: {
    poll: workerPollCommand,
  },
});
