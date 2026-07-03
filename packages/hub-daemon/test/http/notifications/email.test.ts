import { describe, expect, test, vi } from "vitest";
import { createNoopEmailAdapter } from "@murrmure/hub-core";

describe("http/notifications/email", () => {
  test("email adapter noop in test", async () => {
    const lines: string[] = [];
    const adapter = createNoopEmailAdapter({
      info: (message, meta) => lines.push(`${message}:${JSON.stringify(meta)}`),
    });

    await adapter.send({
      to_actor_id: "actor_bootstrap",
      subject: "Gate needs your decision",
      body_text: "Approval needed",
      html_link: "http://127.0.0.1:8787/runs/run_1?gate=chk_gate1",
    });

    expect(lines.some((l) => l.includes("noop"))).toBe(true);
    expect(lines.some((l) => l.includes("actor_bootstrap"))).toBe(true);
  });
});
