// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ViewCanvasHost } from "./ViewCanvasHost.js";
import type { ViewAppContext } from "@murrmure/view-sdk";

afterEach(() => cleanup());

const baseContext: ViewAppContext = {
  flow_id: "flw_preview",
  space_id: "spc_demo",
  hub_base_url: "http://127.0.0.1:8787",
  token: "tok_read",
  session_id: "ses_review",
  run_id: "run_abc",
  gate: { gate_id: "gte_1", step_id: "review" },
};

describe("ViewCanvasHost", () => {
  it("fills primary region width (not drawer 480px)", () => {
    const { container } = render(
      <ViewCanvasHost
        title="Preview review"
        iframeSrc="http://localhost:5173/"
        viewRef={{
          view_id: "preview-review",
          origin_space_id: "spc_demo",
          entry_url: "./dist/index.html",
        }}
        context={baseContext}
        onSubmit={vi.fn()}
      />,
    );

    const host = container.querySelector('[data-testid="view-canvas-host"]');
    expect(host).toBeTruthy();
    expect(host?.className).toContain("w-full");
    expect(host?.className).not.toContain("max-w-md");
    expect(host?.className).not.toContain("max-w-lg");
  });

  it("shows session title without run id in header", () => {
    render(
      <ViewCanvasHost
        title="Validate homepage preview"
        iframeSrc="http://localhost:5173/"
        context={baseContext}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Validate homepage preview" })).toBeTruthy();
    expect(screen.queryByText("run_abc")).toBeNull();
  });

  it("dev mode logs submit without calling onSubmit", () => {
    const onSubmit = vi.fn();
    render(
      <ViewCanvasHost
        title="Dev view"
        iframeSrc="http://localhost:5173/"
        context={baseContext}
        onSubmit={onSubmit}
        devMode
        fixtureTabs={[{ name: "gate-round-1", context: baseContext }]}
        activeFixture="gate-round-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "gate-round-1" }));
    expect(screen.getByTestId("view-canvas-fixture-tabs")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
