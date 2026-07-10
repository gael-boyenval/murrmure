import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/events/event-handler-dispatch", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let spaceId = "";
  let spaceRoot = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "event-handler-dispatch-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000082",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;
    spaceRoot = fixture.dataDir;

    spaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "event-handler",
      name: "Event Handler",
    });

    const link = await fetch(`${baseUrl}/v1/spaces/${spaceId}/link`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        host: "local",
        path: spaceRoot,
        primary: true,
      }),
    });
    expect(link.status).toBe(200);

    const apply = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:event-actions",
            file: {
              version: 1,
              actions: {
                "brief-wake": {
                  executor: "shell",
                  command: "echo brief-wake",
                },
              },
            },
          },
          executors: {
            digest: "sha256:event-executors",
            file: {
              executors: {
                shell: {
                  binding: {
                    type: "shell_spawn",
                    executor_id: "shell",
                  },
                },
              },
            },
          },
          handlers: {
            digest: "sha256:event-handlers",
            file: {
              version: 1,
              handlers: [
                {
                  id: "brief-wake",
                  contract_keys: [],
                  on: {
                    event: {
                      type: "brief.requested",
                    },
                  },
                  type: "shell_spawn",
                  complete: "explicit",
                  command: "echo handler-brief-wake",
                },
              ],
            },
          },
          hooks: { digest: "sha256:event-hooks-empty", file: { version: 1, hooks: {} } },
          flows: [],
          views: [],
        },
      }),
    });
    expect(apply.status).toBe(200);
  });

  afterAll(() => cleanup?.());

  async function waitForJournalEntries(type: string): Promise<number> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const journal = await fetch(`${baseUrl}/v1/journal?type=${encodeURIComponent(type)}`, {
        headers: bootstrapAuth(bootstrapToken),
      }).then((res) => res.json() as Promise<{ entries?: Array<{ type?: string }> }>);
      const count = (journal.entries ?? []).length;
      if (count > 0) return count;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return 0;
  }

  test("dispatches brief.requested event through handler path and journals action dispatch", async () => {
    const emit = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        event_type: "brief.requested",
        payload: {
          topic: "roadmap",
        },
      }),
    });
    expect(emit.status).toBe(200);

    const sessions = await fetch(`${baseUrl}/v1/sessions`, {
      headers: bootstrapAuth(bootstrapToken),
    }).then((res) =>
      res.json() as Promise<{ sessions: Array<{ title: string; session_id: string }> }>,
    );
    expect(sessions.sessions.some((session) => session.title === "Handler brief-wake")).toBe(true);

    expect(await waitForJournalEntries("mrmr.session.created")).toBeGreaterThan(0);
  });
});
