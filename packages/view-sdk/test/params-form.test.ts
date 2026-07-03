import { describe, expect, it } from "vitest";
import { defaultRunParamsForm, paramsSchemaToGateForm } from "../src/params-form.js";

describe("paramsSchemaToGateForm", () => {
  it("maps title from schema properties", () => {
    const form = paramsSchemaToGateForm({
      properties: {
        topic: { type: "string", title: "Review topic" },
      },
      required: ["topic"],
    });
    expect(form.fields[0]?.title).toBe("Review topic");
  });

  it("maps description from schema properties", () => {
    const form = paramsSchemaToGateForm({
      properties: {
        topic: { type: "string", description: "What should this run review?" },
      },
      required: ["topic"],
    });
    expect(form.fields[0]?.description).toBe("What should this run review?");
  });

  it("marks required fields from schema required array", () => {
    const form = paramsSchemaToGateForm({
      properties: {
        topic: { type: "string" },
        notes: { type: "string" },
      },
      required: ["topic"],
    });
    expect(form.fields.find((f) => f.name === "topic")?.required).toBe(true);
    expect(form.fields.find((f) => f.name === "notes")?.required).toBe(false);
  });

  it("maps enum properties to enum field type with values", () => {
    const form = paramsSchemaToGateForm({
      properties: {
        depth: { type: "string", enum: ["quick", "standard", "deep"] },
      },
    });
    const field = form.fields[0];
    expect(field?.type).toBe("enum");
    expect(field?.values).toEqual(["quick", "standard", "deep"]);
  });

  it("returns default form for empty schema", () => {
    expect(paramsSchemaToGateForm({ properties: {} })).toEqual(defaultRunParamsForm());
    expect(paramsSchemaToGateForm(null)).toEqual(defaultRunParamsForm());
    expect(paramsSchemaToGateForm(undefined)).toEqual(defaultRunParamsForm());
  });
});
