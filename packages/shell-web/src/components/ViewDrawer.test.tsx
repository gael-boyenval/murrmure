// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ViewParamForm } from "./ViewParamForm.js";
import { ReviewParamsView } from "./ReviewParamsView.js";

afterEach(() => cleanup());

describe("ViewParamForm", () => {
  it("submits GateFormSchema-style fields", async () => {
    const onSubmit = vi.fn();
    render(
      <ViewParamForm
        form={{
          id: "run.params.v1",
          fields: [{ name: "topic", type: "string", required: true }],
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: "news" } });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ topic: "news" });
    });
  });
});

describe("ReviewParamsView", () => {
  it("collects topic and depth for built-in shell route", async () => {
    const onSubmit = vi.fn();
    render(<ReviewParamsView onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/^Topic/i), { target: { value: "ai safety" } });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ topic: "ai safety", depth: "standard" });
    });
  });
});
