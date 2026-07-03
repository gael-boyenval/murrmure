// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JournalProvider } from "./JournalProvider.js";
import { ShellClientContext } from "./ShellClientProvider.js";
import type { ShellClient, JournalSsePayload } from "@murrmure/shell-client";

function wrapper(client: ShellClient | null, queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ShellClientContext.Provider value={client}>{children}</ShellClientContext.Provider>
    </QueryClientProvider>
  );
}

describe("JournalProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates spaces query on journal event", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    let handler: ((payload: { event: string; data: Record<string, unknown> }) => void) | undefined;
    const mockClient = {
      spaces: { list: async () => [] },
      me: { get: async () => ({ actor_id: "test" }), patch: async () => ({ actor_id: "test" }) },
      notifications: { list: async () => ({ notifications: [], pending_count: 0 }), dismiss: async () => undefined },
      gates: { listForRun: async () => [], resolve: async () => ({}) as never },
      auth: { mintSseTicket: async () => ({ ticket: "tkt_test", expires_in: 60 }) },
      journal: {
        subscribe(onEvent: (payload: JournalSsePayload) => void) {
          handler = onEvent;
          return () => undefined;
        },
        query: async () => [],
      },
    } as unknown as ShellClient;

    render(
      <JournalProvider>
        <div>child</div>
      </JournalProvider>,
      { wrapper: wrapper(mockClient, queryClient) },
    );

    handler?.({
      event: "space.list_changed",
      data: { space_id: "spc_demo" },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["spaces"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["space", "spc_demo"] });
    });
  });

  it("invalidates notifications on gate events without space_id", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    let handler: ((payload: { event: string; data: Record<string, unknown> }) => void) | undefined;
    const mockClient = {
      spaces: { list: async () => [] },
      me: { get: async () => ({ actor_id: "test" }), patch: async () => ({ actor_id: "test" }) },
      notifications: { list: async () => ({ notifications: [], pending_count: 0 }), dismiss: async () => undefined },
      gates: { listForRun: async () => [], resolve: async () => ({}) as never },
      auth: { mintSseTicket: async () => ({ ticket: "tkt_test", expires_in: 60 }) },
      journal: {
        subscribe(onEvent: (payload: JournalSsePayload) => void) {
          handler = onEvent;
          return () => undefined;
        },
        query: async () => [],
      },
    } as unknown as ShellClient;

    render(
      <JournalProvider>
        <div>child</div>
      </JournalProvider>,
      { wrapper: wrapper(mockClient, queryClient) },
    );

    handler?.({
      event: "notification.changed",
      data: { gate_id: "gte_demo" },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["space", expect.anything()] });
  });

  it("invalidates session and space-home on journal.append with session_id", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    let handler: ((payload: { event: string; data: Record<string, unknown> }) => void) | undefined;
    const mockClient = {
      spaces: { list: async () => [] },
      me: { get: async () => ({ actor_id: "test" }), patch: async () => ({ actor_id: "test" }) },
      notifications: { list: async () => ({ notifications: [], pending_count: 0 }), dismiss: async () => undefined },
      gates: { listForRun: async () => [], resolve: async () => ({}) as never },
      auth: { mintSseTicket: async () => ({ ticket: "tkt_test", expires_in: 60 }) },
      journal: {
        subscribe(onEvent: (payload: JournalSsePayload) => void) {
          handler = onEvent;
          return () => undefined;
        },
        query: async () => [],
      },
    } as unknown as ShellClient;

    render(
      <JournalProvider>
        <div>child</div>
      </JournalProvider>,
      { wrapper: wrapper(mockClient, queryClient) },
    );

    handler?.({
      event: "journal.append",
      data: {
        type: "mrmr.session.cancel_requested",
        space_id: "spc_demo",
        session_id: "ses_abc123",
      },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["space-home", "spc_demo"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["session", "ses_abc123"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["session-runs", "ses_abc123"] });
    });
  });

  it("invalidates run queries on journal.append with run_id", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    let handler: ((payload: { event: string; data: Record<string, unknown> }) => void) | undefined;
    const mockClient = {
      spaces: { list: async () => [] },
      me: { get: async () => ({ actor_id: "test" }), patch: async () => ({ actor_id: "test" }) },
      notifications: { list: async () => ({ notifications: [], pending_count: 0 }), dismiss: async () => undefined },
      gates: { listForRun: async () => [], resolve: async () => ({}) as never },
      auth: { mintSseTicket: async () => ({ ticket: "tkt_test", expires_in: 60 }) },
      journal: {
        subscribe(onEvent: (payload: JournalSsePayload) => void) {
          handler = onEvent;
          return () => undefined;
        },
        query: async () => [],
      },
    } as unknown as ShellClient;

    render(
      <JournalProvider>
        <div>child</div>
      </JournalProvider>,
      { wrapper: wrapper(mockClient, queryClient) },
    );

    handler?.({
      event: "journal.append",
      data: {
        type: "mrmr.run.failed",
        space_id: "spc_demo",
        session_id: "ses_abc123",
        run_id: "run_xyz789",
        reason: "cancelled",
      },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["run", "run_xyz789"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["run-graph", "run_xyz789"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["gates", "run_xyz789"] });
    });
  });

  it("invalidates space-home and flow-preview on space index update", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    let handler: ((payload: { event: string; data: Record<string, unknown> }) => void) | undefined;
    const mockClient = {
      spaces: { list: async () => [] },
      me: { get: async () => ({ actor_id: "test" }), patch: async () => ({ actor_id: "test" }) },
      notifications: { list: async () => ({ notifications: [], pending_count: 0 }), dismiss: async () => undefined },
      gates: { listForRun: async () => [], resolve: async () => ({}) as never },
      auth: { mintSseTicket: async () => ({ ticket: "tkt_test", expires_in: 60 }) },
      journal: {
        subscribe(onEvent: (payload: JournalSsePayload) => void) {
          handler = onEvent;
          return () => undefined;
        },
        query: async () => [],
      },
    } as unknown as ShellClient;

    render(
      <JournalProvider>
        <div>child</div>
      </JournalProvider>,
      { wrapper: wrapper(mockClient, queryClient) },
    );

    handler?.({
      event: "mrmr.space.index_updated",
      data: {
        space_id: "spc_demo",
        changed: 2,
      },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["space-home", "spc_demo"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["flow-preview", "spc_demo"] });
    });
  });

  it("invalidates space-home on journal.append space index type", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    let handler: ((payload: { event: string; data: Record<string, unknown> }) => void) | undefined;
    const mockClient = {
      spaces: { list: async () => [] },
      me: { get: async () => ({ actor_id: "test" }), patch: async () => ({ actor_id: "test" }) },
      notifications: { list: async () => ({ notifications: [], pending_count: 0 }), dismiss: async () => undefined },
      gates: { listForRun: async () => [], resolve: async () => ({}) as never },
      auth: { mintSseTicket: async () => ({ ticket: "tkt_test", expires_in: 60 }) },
      journal: {
        subscribe(onEvent: (payload: JournalSsePayload) => void) {
          handler = onEvent;
          return () => undefined;
        },
        query: async () => [],
      },
    } as unknown as ShellClient;

    render(
      <JournalProvider>
        <div>child</div>
      </JournalProvider>,
      { wrapper: wrapper(mockClient, queryClient) },
    );

    handler?.({
      event: "journal.append",
      data: {
        type: "mrmr.space.index_updated",
        space_id: "spc_demo",
        changed: 1,
      },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["space-home", "spc_demo"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["flow-preview", "spc_demo"] });
    });
  });
});
