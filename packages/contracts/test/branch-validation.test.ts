import { describe, expect, test } from "vitest";
import {
  assertSupportedPayloadSchema,
  partitionRequiredFields,
  validateBranchContract,
} from "../src/index.js";

describe("branch contract validation", () => {
  const contract = {
    schema: {
      type: "object",
      required: ["reviewer", "spec"],
      properties: {
        reviewer: { type: "string", format: "email" },
      },
      additionalProperties: false,
    },
    payload_required: ["reviewer"],
    artifact_required: ["spec"],
    artifact_slots: {
      spec: {
        media_types: ["text/markdown"],
        extensions: [".md"],
        min_bytes: 1,
        max_bytes: 10,
      },
    },
  };

  test("partitions same-branch required names", () => {
    expect(partitionRequiredFields(contract.schema, contract.artifact_slots)).toEqual({
      payload_required: ["reviewer"],
      artifact_required: ["spec"],
    });
  });

  test("validates Draft 2020-12 payload and artifact metadata with normalized errors", () => {
    expect(
      validateBranchContract(contract, {
        payload: { reviewer: "not-an-email" },
        files: {
          spec: { name: "spec.txt", media_type: "text/plain", size_bytes: 0 },
        },
      }),
    ).toMatchObject({
      ok: false,
      code: "CONTRACT_VALIDATION_FAILED",
      errors: expect.arrayContaining([
        expect.objectContaining({ source: "payload", path: "/reviewer", rule: "format" }),
        expect.objectContaining({ source: "artifact", path: "/files/spec/0", rule: "min_bytes" }),
        expect.objectContaining({ source: "artifact", rule: "media_type" }),
        expect.objectContaining({ source: "artifact", rule: "extension" }),
      ]),
    });
    expect(
      validateBranchContract(contract, {
        payload: { reviewer: "dev@example.com" },
        files: {
          spec: { name: "SPEC.MD", media_type: "text/markdown", size_bytes: 4 },
        },
      }),
    ).toEqual({ ok: true });
  });

  test("rejects remote refs and unknown formats", () => {
    expect(() => assertSupportedPayloadSchema({
      type: "object",
      properties: { remote: { $ref: "https://example.com/schema.json" } },
    })).toThrow(/Remote \$ref/);
    expect(() => assertSupportedPayloadSchema({
      type: "object",
      properties: { value: { type: "string", format: "user-code" } },
    })).toThrow();
  });
});
