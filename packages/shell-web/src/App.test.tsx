// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import { ShellClientProvider } from "./providers/ShellClientProvider.js";
import { JournalProvider } from "./providers/JournalProvider.js";

vi.mock("./hooks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks.js")>();
  return {
    ...actual,
    isBundledShell: vi.fn(() => true),
    getStorageItem: vi.fn((key: string) => (key === "murrmure_token" ? "tok_test" : null)),
  };
});

vi.mock("@murrmure/shell-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@murrmure/shell-client")>();
  return {
    ...actual,
    createShellClient: vi.fn(() => ({
      spaces: { list: vi.fn().mockResolvedValue([]) },
      auth: { mintSseTicket: vi.fn() },
      journal: { subscribe: () => () => undefined },
      me: { get: vi.fn() },
    })),
  };
});

describe("App /connect route", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders ConnectPage for bundled authenticated users", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/connect"]}>
          <ShellClientProvider>
            <JournalProvider>
              <App />
            </JournalProvider>
          </ShellClientProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Connect agent")).toBeTruthy();
  });
});
