import { describe, expect, test } from "vitest";
import { ensureObjectInputSchema } from "../src/input-schema.js";

describe("ensureObjectInputSchema", () => {
  test("fills missing type so Cursor accepts tools/list", () => {
    const schema = ensureObjectInputSchema({
      oneOf: [{ type: "object", properties: { event_type: { type: "string" } } }],
    });
    expect(schema.type).toBe("object");
    expect(schema).toHaveProperty("oneOf");
  });

  test("leaves a valid object schema unchanged", () => {
    const input = { type: "object", properties: { id: { type: "string" } } };
    expect(ensureObjectInputSchema(input)).toBe(input);
  });

  test("defaults undefined schema", () => {
    expect(ensureObjectInputSchema(undefined)).toEqual({
      type: "object",
      additionalProperties: true,
    });
  });
});
