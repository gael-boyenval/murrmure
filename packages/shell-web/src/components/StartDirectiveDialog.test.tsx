// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ShellClient } from "@murrmure/shell-client";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { StartDirectiveDialog } from "./StartDirectiveDialog.js";
import { DIRECTIVE_FLOW_ID } from "../lib/start-directive.js";

afterEach(() => cleanup());

function mockClient(overrides: {
  runFlow?: ReturnType<typeof vi.fn>;
  getRun?: ReturnType<typeof vi.fn>;
  eligible?: Array<{ space_id: string; name?: string; slug?: string; handler_id: string }>;
} = {}): ShellClient {
  const runFlow =
    overrides.runFlow ??
    vi.fn().mockResolvedValue({
      session: { session_id: "ses_dir", title: "directive" },
      run_id: "run_dir",
      flow_digest: "sha256:dir",
    });
  const getRun =
    overrides.getRun ??
    vi.fn().mockResolvedValue({
      run_id: "run_dir",
      session_id: "ses_dir",
      lifecycle: "completed",
      result: { step_id: "execute", status: "completed", message: "pong" },
    });
  return {
    spaces: {
      list: vi.fn().mockResolvedValue([
        { space_id: "spc_app", name: "App", slug: "app" },
        { space_id: "spc_research", name: "Research", slug: "research" },
      ]),
      runFlow,
    },
    directives: {
      eligible: vi.fn().mockResolvedValue({
        spaces: overrides.eligible ?? [
          { space_id: "spc_app", name: "App", slug: "app", handler_id: "directive" },
        ],
      }),
    },
    runs: { get: getRun },
  } as unknown as ShellClient;
}

function renderDialog(client: ShellClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={client}>
          <MemoryRouter>
            <StartDirectiveDialog />
          </MemoryRouter>
        </ShellClientContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "New directive" }));
  expect(await screen.findByTestId("start-directive-dialog")).toBeTruthy();
  expect(await screen.findByText("App")).toBeTruthy();
}

describe("StartDirectiveDialog", () => {
  it("requires a prompt and eligible space, then stays open with results", async () => {
    const runFlow = vi.fn().mockResolvedValue({
      session: { session_id: "ses_dir", title: "directive" },
      run_id: "run_dir",
      flow_digest: "sha256:dir",
    });
    renderDialog(mockClient({ runFlow }));
    await openDialog();

    expect(screen.getByText("No directive handler — apply the recipe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run directive" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText("App"));
    expect(screen.getByRole("button", { name: "Run directive" })).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Say pong" } });
    fireEvent.click(screen.getByRole("button", { name: "Run directive" }));

    await waitFor(() => {
      expect(runFlow).toHaveBeenCalledWith(DIRECTIVE_FLOW_ID, {
        space_id: "spc_app",
        input: { prompt: "Say pong" },
      });
    });
    expect(await screen.findByTestId("directive-results")).toBeTruthy();
    expect(await screen.findByText("pong")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open session" }).getAttribute("href")).toBe(
      "/sessions/ses_dir",
    );
    expect(screen.getByTestId("start-directive-dialog")).toBeTruthy();
  });

  it("selects every eligible space", async () => {
    renderDialog(
      mockClient({
        eligible: [
          { space_id: "spc_app", name: "App", handler_id: "directive" },
          { space_id: "spc_research", name: "Research", handler_id: "directive" },
        ],
      }),
    );
    await openDialog();
    fireEvent.click(screen.getByLabelText("Select all eligible"));
    expect(screen.getByLabelText("App").getAttribute("data-state")).toBe("checked");
    expect(screen.getByLabelText("Research").getAttribute("data-state")).toBe("checked");
  });
});
