import { describe, expect, test, vi } from "vitest";
import { ControlBus } from "../../src/control-bus.js";
import { InMemoryLiveAssignments } from "../../src/live-assignments.js";
import { McpSessionRegistry } from "../../src/mcp-session-registry.js";
import { MeetingNotifier } from "../../src/meeting-notifier.js";

describe("live-assignments join-once", () => {
  test("queues said until the seat's MCP connects, then notifies that principal", async () => {
    const published: Array<{ client_id: string; message_id: string }> = [];
    const bus = new ControlBus();
    const registry = new McpSessionRegistry(bus);
    const notifier = new MeetingNotifier({
      publishToPrincipal: (principal, message) => {
        published.push({
          client_id: principal.client_id,
          message_id: String(message.params.message_id),
        });
      },
      mcpSessionRegistry: registry,
    });
    const live = new InMemoryLiveAssignments(notifier, registry);

    await live.start({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      handler_id: "meeting-developer",
      run_id: "run_1",
      space_id: "spc_demo",
    });

    await live.notify({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      message_id: "msg_2",
      since_seq: 2,
      handler_id: "meeting-developer",
    });
    expect(published).toEqual([]);

    // The operator keeps polling after the seat starts. Re-handshake must not
    // claim an unmatched meeting seat.
    registry.connect({
      space_id: "spc_demo",
      token_id: "tok_ide",
      client_id: "operator-ide",
    });
    expect(published).toEqual([]);

    registry.connect(
      {
        space_id: "spc_demo",
        token_id: "tok_spawn",
        client_id: "spawn-child",
      },
      { session_id: "ses_room1", participant_id: "ptc_developer" },
    );

    await vi.waitFor(() => {
      expect(published).toEqual([{ client_id: "spawn-child", message_id: "msg_2" }]);
    });
  });

  test("does not bind an already-open operator chat that connected before start", async () => {
    const published: Array<{ client_id: string }> = [];
    const bus = new ControlBus();
    const registry = new McpSessionRegistry(bus);
    const notifier = new MeetingNotifier({
      publishToPrincipal: (principal) => {
        published.push({ client_id: principal.client_id });
      },
      mcpSessionRegistry: registry,
    });
    const live = new InMemoryLiveAssignments(notifier, registry);

    registry.connect({
      space_id: "spc_demo",
      token_id: "tok_ide",
      client_id: "operator-ide",
    });

    await live.start({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      handler_id: "meeting-developer",
      run_id: "run_1",
      space_id: "spc_demo",
    });
    await live.notify({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      message_id: "msg_2",
      since_seq: 2,
      handler_id: "meeting-developer",
    });
    expect(published).toEqual([]);

    registry.connect(
      {
        space_id: "spc_demo",
        token_id: "tok_spawn",
        client_id: "spawn-child",
      },
      { session_id: "ses_room1", participant_id: "ptc_developer" },
    );

    await vi.waitFor(() => {
      expect(published).toEqual([{ client_id: "spawn-child" }]);
    });
  });

  test("binds two same-space children by exact ptc instead of connection order", async () => {
    const published: Array<{ client_id: string; participant_id: string }> = [];
    const bus = new ControlBus();
    const registry = new McpSessionRegistry(bus);
    const notifier = new MeetingNotifier({
      publishToPrincipal: (principal, message) => {
        published.push({
          client_id: principal.client_id,
          participant_id: String(message.params.participant_id),
        });
      },
      mcpSessionRegistry: registry,
    });
    const live = new InMemoryLiveAssignments(notifier, registry);
    for (const participant_id of ["ptc_designer", "ptc_qa"]) {
      await live.start({
        session_id: "ses_room1",
        participant_id,
        handler_id: `meeting-${participant_id.slice(4)}`,
        run_id: `run_${participant_id}`,
        space_id: "spc_demo",
      });
      await live.notify({
        session_id: "ses_room1",
        participant_id,
        message_id: `msg_${participant_id}`,
        since_seq: 2,
        handler_id: `meeting-${participant_id.slice(4)}`,
      });
    }

    registry.connect(
      { space_id: "spc_demo", token_id: "tok_qa", client_id: "qa-child" },
      { session_id: "ses_room1", participant_id: "ptc_qa" },
    );
    await vi.waitFor(() => {
      expect(published).toEqual([{ client_id: "qa-child", participant_id: "ptc_qa" }]);
    });

    registry.connect(
      { space_id: "spc_demo", token_id: "tok_designer", client_id: "designer-child" },
      { session_id: "ses_room1", participant_id: "ptc_designer" },
    );
    await vi.waitFor(() => {
      expect(published).toEqual([
        { client_id: "qa-child", participant_id: "ptc_qa" },
        { client_id: "designer-child", participant_id: "ptc_designer" },
      ]);
    });
  });

  test("writes later said to the persistent PTY without waiting for MCP", async () => {
    const bus = new ControlBus();
    const registry = new McpSessionRegistry(bus);
    const published: string[] = [];
    const notifier = new MeetingNotifier({
      publishToPrincipal: (_principal, message) => {
        published.push(String(message.params.message_id));
      },
      mcpSessionRegistry: registry,
    });
    const live = new InMemoryLiveAssignments(notifier, registry);
    const writes: string[] = [];

    await live.start({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      handler_id: "meeting-developer",
      run_id: "run_1",
      space_id: "spc_demo",
    });
    live.attachController("ses_room1", "ptc_developer", {
      close: async () => undefined,
      write: (text) => writes.push(text),
    });

    await live.notify({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      message_id: "msg_2",
      since_seq: 2,
      handler_id: "meeting-developer",
      prompt: "New message in this meeting.\n\ntext: hello",
    });

    expect(writes).toEqual(["New message in this meeting.\n\ntext: hello"]);
    expect(published).toEqual([]);
  });

  test("flushes queued said to the PTY when the controller attaches", async () => {
    const bus = new ControlBus();
    const registry = new McpSessionRegistry(bus);
    const notifier = new MeetingNotifier({
      publishToPrincipal: () => undefined,
      mcpSessionRegistry: registry,
    });
    const live = new InMemoryLiveAssignments(notifier, registry);
    const writes: string[] = [];

    await live.start({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      handler_id: "meeting-developer",
      run_id: "run_1",
      space_id: "spc_demo",
    });
    await live.notify({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      message_id: "msg_2",
      since_seq: 2,
      handler_id: "meeting-developer",
      prompt: "queued turn",
    });
    expect(writes).toEqual([]);

    live.attachController("ses_room1", "ptc_developer", {
      close: async () => undefined,
      write: (text) => writes.push(text),
    });

    await vi.waitFor(() => expect(writes).toEqual(["queued turn"]));
  });

  test("closes the persistent controller when the meeting seat is revoked", async () => {
    const bus = new ControlBus();
    const registry = new McpSessionRegistry(bus);
    const notifier = new MeetingNotifier({
      publishToPrincipal: () => undefined,
      mcpSessionRegistry: registry,
    });
    const live = new InMemoryLiveAssignments(notifier, registry);
    const close = vi.fn(async () => undefined);

    await live.start({
      session_id: "ses_room1",
      participant_id: "ptc_developer",
      handler_id: "meeting-developer",
      run_id: "run_1",
      space_id: "spc_demo",
    });
    live.attachController("ses_room1", "ptc_developer", { close });

    await live.revoke({ session_id: "ses_room1" });

    expect(close).toHaveBeenCalledWith("meeting_closed");
    expect(
      await live.findLive({ session_id: "ses_room1", participant: "ptc_developer" }),
    ).toBeNull();
  });
});
