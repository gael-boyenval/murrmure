import { describe, expect, test } from "vitest";
import { PersonaIdSchema, PersonasFileSchema } from "../src/index.js";

describe("meetings/personas schema", () => {
  test("accepts a valid personas file", () => {
    const parsed = PersonasFileSchema.parse({
      version: 1,
      personas: [
        {
          id: "researcher",
          summary: "Technical research and prior art",
          asks: ["literature / papers on a topic"],
          requests: ["attach a written brief"],
        },
      ],
    });
    expect(parsed.personas).toHaveLength(1);
    expect(parsed.personas[0]?.id).toBe("researcher");
  });

  test("rejects duplicate persona ids in the file", () => {
    const parsed = PersonasFileSchema.safeParse({
      version: 1,
      personas: [
        { id: "designer", summary: "Product design" },
        { id: "designer", summary: "Another designer" },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  test("persona id regex", () => {
    expect(PersonaIdSchema.safeParse("designer").success).toBe(true);
    expect(PersonaIdSchema.safeParse("qa-lead").success).toBe(true);
    expect(PersonaIdSchema.safeParse("r1").success).toBe(true);
    expect(PersonaIdSchema.safeParse("Designer").success).toBe(false);
    expect(PersonaIdSchema.safeParse("1designer").success).toBe(false);
    expect(PersonaIdSchema.safeParse("").success).toBe(false);
    expect(PersonaIdSchema.safeParse("a".repeat(65)).success).toBe(false);
  });
});
