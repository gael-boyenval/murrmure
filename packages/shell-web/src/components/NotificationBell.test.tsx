// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import type { ShellClient } from "@murrmure/shell-client";

afterEach(() => cleanup());

function createMockClient(pendingCount: number): ShellClient {
  return {
    notifications: {
      list: vi.fn().mockResolvedValue({ notifications: [], pending_count: pendingCount }),
      dismiss: vi.fn(),
    },
  } as unknown as ShellClient;
}

function renderBell(pendingCount: number, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const client = createMockClient(pendingCount);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </ShellClientContext.Provider>
    </QueryClientProvider>
  );

  return { ...render(<NotificationBell />, { wrapper }), client, queryClient };
}

describe("NotificationBell", () => {
  it("sets accessible link name with pending count", async () => {
    renderBell(3);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Needs you, 3 pending" })).toBeTruthy();
    });
  });

  it("sets accessible link name without count when zero pending", async () => {
    renderBell(0);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Needs you" })).toBeTruthy();
    });
  });

  it("exposes aria-live polite region for count updates", async () => {
    const { container } = renderBell(3);

    await waitFor(() => {
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeTruthy();
      expect(liveRegion?.getAttribute("aria-atomic")).toBe("true");
      expect(liveRegion?.textContent).toBe("3 pending");
    });
  });

  it("announces zero pending in live region", async () => {
    const { container } = renderBell(0);

    await waitFor(() => {
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toBe("No pending notifications");
    });
  });

  it("updates live region when pending count changes", async () => {
    let pendingCount = 2;
    const client = {
      notifications: {
        list: vi.fn().mockImplementation(async () => ({
          notifications: [],
          pending_count: pendingCount,
        })),
        dismiss: vi.fn(),
      },
    } as unknown as ShellClient;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ShellClientContext.Provider value={client}>
          <MemoryRouter>{children}</MemoryRouter>
        </ShellClientContext.Provider>
      </QueryClientProvider>
    );

    const { container, rerender } = render(<NotificationBell />, { wrapper });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Needs you, 2 pending" })).toBeTruthy();
      expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("2 pending");
    });

    pendingCount = 5;
    await queryClient.invalidateQueries({ queryKey: ["notifications", "pending"] });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Needs you, 5 pending" })).toBeTruthy();
      expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("5 pending");
    });

    rerender(<NotificationBell />);
  });
});
