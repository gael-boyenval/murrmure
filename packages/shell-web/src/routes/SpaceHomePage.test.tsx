/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ShellClient } from "@murrmure/shell-client";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { SpaceHomePage } from "./SpaceHomePage.js";

vi.mock("../layout/AppShell.js", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const emptyHome = {
  version: 2 as const,
  space_id: "spc_demo",
  needs_attention: [],
  active_runs: [],
  flows: [],
  receiving_from: [],
  recent_completed: [],
  index: {
    counts: { actions: 0, executors: 0, handlers: 0, events: 0, flows: 0, declared_events: 0 },
    actions: [],
    handlers: [],
    events: [],
  },
  emittable_events: [],
};

function renderHome(spaces: Array<{ space_id: string; name?: string; slug?: string; description?: string }>) {
  const client = {
    spaces: {
      list: vi.fn().mockResolvedValue(spaces),
      home: vi.fn().mockResolvedValue(emptyHome),
    },
    dev: {
      viewSession: vi.fn().mockResolvedValue({ session: null }),
    },
  } as unknown as ShellClient;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={client}>
        <MemoryRouter initialEntries={["/spaces/spc_demo"]}>
          <Routes>
            <Route path="/spaces/:spaceId" element={<SpaceHomePage />} />
          </Routes>
        </MemoryRouter>
      </ShellClientContext.Provider>
    </QueryClientProvider>,
  );
}

describe("SpaceHomePage purpose", () => {
  afterEach(() => cleanup());

  it("renders description under the space title", async () => {
    renderHome([
      {
        space_id: "spc_demo",
        name: "Meetings app",
        slug: "meetings-app",
        description: "Convenes product seats and chairs the room.",
      },
    ]);

    expect(await screen.findByRole("heading", { name: "Meetings app" })).toBeTruthy();
    expect(screen.getByText("Convenes product seats and chairs the room.")).toBeTruthy();
    expect(screen.getByText("meetings-app")).toBeTruthy();
  });

  it("hides the subtitle when description is absent", async () => {
    renderHome([{ space_id: "spc_demo", name: "Meetings app", slug: "meetings-app" }]);

    expect(await screen.findByRole("heading", { name: "Meetings app" })).toBeTruthy();
    expect(screen.queryByText("Convenes product seats and chairs the room.")).toBeNull();
  });
});
