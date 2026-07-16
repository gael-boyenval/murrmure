import { describe, expect, test } from "vitest";
import { addGateId, addSpaceId, stripPrefix, contractV2ToRuleArtifact, mapWaitCondition } from "@murrmure/hub-core";
import { ContractV2Schema } from "@murrmure/contracts";
import { ruleRefDigest } from "@murrmure/runtime-contracts";
import { loadHubContractFixture } from "../../../test-utils/hub/contracts.js";

describe("bridge/ids", () => {
  test("prefix roundtrip", () => {
    const bare = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    expect(stripPrefix(addSpaceId(bare))).toBe(bare);
    expect(addGateId(bare)).toBe(`chk_${bare}`);
  });
});

describe("bridge/contract-v2", () => {
  test("maps to RuleArtifact v1", () => {
    const raw = loadHubContractFixture("linear-demo-v2");
    const contract = ContractV2Schema.parse(raw);
    const artifact = contractV2ToRuleArtifact(contract);
    expect(artifact.schema_version).toBe("1.0");
    expect(artifact.transitions[0]?.checkpoint?.quorum).toBe("any");
    expect(artifact.transitions[0]?.checkpoint?.assignees).toContain("human:*");
    const digest = ruleRefDigest(artifact);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("bridge/wait-condition", () => {
  test("maps gate to checkpoint", () => {
    const mapped = mapWaitCondition({
      type: "gate",
      gate_id: "chk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      resolution: "approved",
    });
    expect(mapped).toEqual({
      type: "checkpoint",
      checkpoint_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      resolution: "approved",
    });
  });
});

describe("kernel-boundary", () => {
  test("hub-core does not import better-sqlite3", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    expect(pkg.default.dependencies?.["better-sqlite3"]).toBeUndefined();
  });
});
