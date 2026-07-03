// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { ShellClientProvider, useShellClient } from "./ShellClientProvider.js";
import { setStorageItem } from "../hooks.js";

vi.mock("@murrmure/shell-client", () => ({
  createShellClient: vi.fn((opts: { token: string; baseUrl: string }) => ({
    token: opts.token,
    baseUrl: opts.baseUrl,
  })),
}));

function ClientProbe() {
  const client = useShellClient() as { token: string } | null;
  return <div data-testid="token">{client?.token ?? "none"}</div>;
}

function ConnectSimulator() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        setStorageItem("murrmure_token", "tok_saved");
        navigate("/spaces/new");
      }}
    >
      Save
    </button>
  );
}

describe("ShellClientProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("re-reads token after connect navigation", async () => {
    const { createShellClient } = await import("@murrmure/shell-client");

    render(
      <MemoryRouter initialEntries={["/connect"]}>
        <ShellClientProvider>
          <Routes>
            <Route
              path="/connect"
              element={
                <>
                  <ConnectSimulator />
                  <ClientProbe />
                </>
              }
            />
            <Route path="/spaces/new" element={<ClientProbe />} />
          </Routes>
        </ShellClientProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("token").textContent).toBe("none");

    screen.getByText("Save").click();

    await waitFor(() => {
      expect(screen.getByTestId("token").textContent).toBe("tok_saved");
    });

    expect(createShellClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: "tok_saved" }),
    );
  });

  it("re-reads token on cross-tab storage events", async () => {
    const { createShellClient } = await import("@murrmure/shell-client");

    render(
      <MemoryRouter initialEntries={["/spaces/new"]}>
        <ShellClientProvider>
          <ClientProbe />
        </ShellClientProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("token").textContent).toBe("none");

    localStorage.setItem("murrmure_token", "tok_cross_tab");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "murrmure_token",
        newValue: "tok_cross_tab",
        storageArea: localStorage,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("token").textContent).toBe("tok_cross_tab");
    });

    expect(createShellClient).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: "tok_cross_tab" }),
    );
  });
});
