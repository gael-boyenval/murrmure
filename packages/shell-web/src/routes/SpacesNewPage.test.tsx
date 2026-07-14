// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpacesNewPage } from "./SpacesNewPage.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import type { ShellClient } from "@murrmure/shell-client";

describe("SpacesNewPage", () => {
  it("renders CLI instruction blocks", async () => {
    const mockClient = {
      spaces: { list: vi.fn().mockResolvedValue([]) },
      auth: { mintSseTicket: vi.fn() },
      journal: { subscribe: () => () => undefined },
    } as unknown as ShellClient;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={mockClient}>
          <MemoryRouter>
            <SpacesNewPage />
          </MemoryRouter>
        </ShellClientContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Create your first space")).toBeTruthy();
    expect(screen.getByText(/mrmr setup/)).toBeTruthy();
    expect(screen.getByText(/mrmr space init/)).toBeTruthy();
    expect(screen.getByText(/mrmr space link --create/)).toBeTruthy();
    expect(screen.getByText(/mrmr space apply/)).toBeTruthy();
    expect(screen.queryByText(/mrmr grant mint/)).toBeNull();
  });
});
