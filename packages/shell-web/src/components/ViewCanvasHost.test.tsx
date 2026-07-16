// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ViewCanvasHost } from "./ViewCanvasHost.js";
import { VIEW_TRANSPORT_VERSION, type ViewAppContext } from "@murrmure/view-sdk";

afterEach(() => cleanup());

const baseContext: ViewAppContext = {
  flow_id: "flw_preview",
  space_id: "spc_demo",
  hub_base_url: "http://127.0.0.1:8787",
  mode: "production",
  transport_version: VIEW_TRANSPORT_VERSION,
  nonce: "nonce-test",
  session_id: "ses_review",
  run_id: "run_abc",
  step: { step_id: "review", branches: [{ branch: "approve" }] },
};

const okAck = async () => ({ ok: true }) as const;

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
        onSubmitBranch={vi.fn(okAck)}
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
        onSubmitBranch={vi.fn(okAck)}
      />,
    );

    expect(screen.getByRole("heading", { name: "Validate homepage preview" })).toBeTruthy();
    expect(screen.queryByText("run_abc")).toBeNull();
  });

  it("renders observability-only state when no view is bound (no fallback form)", () => {
    const { container } = render(
      <ViewCanvasHost
        title="Awaiting view"
        context={baseContext}
        onSubmitBranch={vi.fn(okAck)}
      />,
    );

    expect(screen.getByTestId("view-canvas-observability")).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
  });

  it("dev mode logs submit_branch without calling onSubmitBranch", () => {
    const onSubmitBranch = vi.fn(okAck);
    render(
      <ViewCanvasHost
        title="Dev view"
        iframeSrc="http://localhost:5173/"
        context={{ ...baseContext, mode: "dev" }}
        onSubmitBranch={onSubmitBranch}
        devMode
        fixtureTabs={[{ name: "gate-round-1", context: baseContext }]}
        activeFixture="gate-round-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "gate-round-1" }));
    expect(screen.getByTestId("view-canvas-fixture-tabs")).toBeTruthy();
    expect(onSubmitBranch).not.toHaveBeenCalled();
  });
});
