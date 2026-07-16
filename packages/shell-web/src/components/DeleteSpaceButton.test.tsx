// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DeleteSpaceButton } from "./DeleteSpaceButton.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import type { ShellClient } from "@murrmure/shell-client";

function renderWithClient(client: ShellClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={client}>
        <MemoryRouter>
          <DeleteSpaceButton spaceId="spc_demo" spaceLabel="Demo space" />
        </MemoryRouter>
      </ShellClientContext.Provider>
    </QueryClientProvider>,
  );
}

describe("DeleteSpaceButton", () => {
  test("confirms before archiving and calls archive on confirm", async () => {
    const archive = vi.fn().mockResolvedValue({ space_id: "spc_demo" });
    const client = {
      spaces: { archive },
    } as unknown as ShellClient;

    renderWithClient(client);

    fireEvent.click(screen.getByRole("button", { name: "Delete space" }));
    expect(screen.getByRole("heading", { name: "Delete space?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith("spc_demo"));
  });
});
