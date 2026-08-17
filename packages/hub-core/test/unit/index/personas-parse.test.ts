import { describe, expect, test } from "vitest";
import { parsePersonasFile } from "../../../src/index/parse-personas.js";

describe("index/parse-personas", () => {
  test("parses a valid personas file", () => {
    const parsed = parsePersonasFile({
      version: 1,
      personas: [
        {
          id: "researcher",
          summary: "Technical research and prior art",
          asks: ["literature / papers on a topic"],
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.personas[0]?.id).toBe("researcher");
  });

  test("rejects duplicate persona ids", () => {
    const parsed = parsePersonasFile({
      version: 1,
      personas: [
        { id: "designer", summary: "A" },
        { id: "designer", summary: "B" },
      ],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("INVALID_PERSONAS");
  });

  test("empty personas list is valid (file optional at apply)", () => {
    const parsed = parsePersonasFile({ version: 1, personas: [] });
    expect(parsed.ok).toBe(true);
  });

  test("rejects invalid persona id", () => {
    const parsed = parsePersonasFile({
      version: 1,
      personas: [{ id: "Designer", summary: "caps" }],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("INVALID_PERSONAS");
  });
});
