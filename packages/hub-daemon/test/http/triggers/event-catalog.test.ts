import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { addTokenId } from "@murrmure/hub-core";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("triggers/event-catalog", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let bootstrapToken: string;

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({ prefix: "tr-catalog-" });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    spaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "specs-catalog",
      install_policy: "authorized_agents",
    });

    await applySpaceBundle(baseUrl, bootstrapToken, spaceId, {
      hooks: {
        digest: "sha256:hooks-catalog",
        file: {
          version: 1,
          hooks: {
            "on-spec-published": {
              on: { event: { type: "spec.published" } },
              do: [{ invoke: { action: "handle_spec_published", params: {} } }],
            },
          },
        },
      },
    });
  });

  afterAll(() => cleanup?.());

  test("lists spec.published from indexed hooks", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/triggers/event-catalog`, {
      headers: { Authorization: `Bearer ${addTokenId(bootstrapToken)}` },
    });
    const body = await res.json();
    const types = body.events.map((e: { type: string }) => e.type);
    expect(types).toContain("spec.published");
  });

  test("lists trigger templates (retired — historical records)", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/triggers/templates`, {
      headers: { Authorization: `Bearer ${addTokenId(bootstrapToken)}` },
    });
    const body = await res.json();
    const templates = body.templates as Array<{ template_id: string; retired?: boolean }>;
    const ids = templates.map((t) => t.template_id);
    // Retained as historical/removal records only (Task 15 Lane C): the mcp_wake
    // wire is 404 and registration is rejected. They are listed for traceability.
    expect(ids).toContain("spec-published-wake-dev");
    expect(ids).toContain("work-ready-wake-frontend");
    for (const t of templates) {
      if (ids.includes(t.template_id)) {
        expect(t.retired).toBe(true);
      }
    }
  });
});
