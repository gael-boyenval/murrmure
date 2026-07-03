import { describe, expect, test } from "vitest";
import { executeCrossSpaceAsk } from "@murrmure/hub-core";

describe("cross-space/query-shim", () => {
  test("unknown query type returns UNKNOWN_QUERY_TYPE", async () => {
    const result = await executeCrossSpaceAsk(
      {
        createQueryId: () => "qry_test",
        getSpace: async () => ({ space_id: "target", slug: "open", name: "Open" } as never),
        getSpaceBindings: async () => [],
        allowInbound: () => true,
        answerLocal: async () => {
          throw new Error("UNKNOWN_QUERY_TYPE");
        },
        bareSpaceId: (id) => id.replace(/^spc_/, ""),
        prefixedSpaceId: (id) => (id.startsWith("spc_") ? id : `spc_${id}`),
        recordQuery: async () => undefined,
      },
      "spc_source",
      "actor_test",
      { target_space_id: "spc_target", query_type: "openapi_diff_ref@1", params: {} },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNKNOWN_QUERY_TYPE");
      expect(result.http_status).toBe(400);
    }
  });
});
