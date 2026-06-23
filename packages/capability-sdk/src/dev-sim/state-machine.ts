export type InstallLifecycleState = "draft" | "validated" | "tested" | "promoted" | "live";

export interface SimulatedInstallSnapshot {
  state: InstallLifecycleState;
  revision: number;
}

export interface SimulatedInstanceSnapshot {
  id: string;
  state: string;
  revision: number;
  actor: "agent" | "human";
  metadata: Record<string, unknown>;
}

export interface SimulatedRuntimeSnapshot {
  fixture: string;
  install: SimulatedInstallSnapshot;
  instances: SimulatedInstanceSnapshot[];
}

interface TransitionError {
  code: string;
  message: string;
  hint?: Record<string, unknown>;
}

interface TransitionSuccess<T> {
  ok: true;
  value: T;
}

interface TransitionFailure {
  ok: false;
  error: TransitionError;
}

type TransitionResult<T> = TransitionSuccess<T> | TransitionFailure;

interface TransitionResolver {
  initialState: string;
  states: Set<string>;
  next: (state: string, event: string) => string | null;
}

interface RuntimeFixture {
  install: SimulatedInstallSnapshot;
  instances: SimulatedInstanceSnapshot[];
}

export const DEV_SIM_FIXTURES = [
  "live-install-ready",
  "pending-review",
  "pending-agent",
  "revision-mismatch",
] as const;

export type DevSimFixture = (typeof DEV_SIM_FIXTURES)[number];

const INSTALL_TRANSITIONS: Record<InstallLifecycleState, Partial<Record<string, InstallLifecycleState>>> = {
  draft: { validate: "validated" },
  validated: { test: "tested" },
  tested: { promote: "promoted" },
  promoted: { apply: "live" },
  live: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function pickState(states: Set<string>, preferred: string[], fallback: string): string {
  for (const candidate of preferred) {
    if (states.has(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

function cloneSnapshot(snapshot: SimulatedRuntimeSnapshot): SimulatedRuntimeSnapshot {
  return {
    fixture: snapshot.fixture,
    install: { ...snapshot.install },
    instances: snapshot.instances.map((instance) => ({
      ...instance,
      metadata: { ...instance.metadata },
    })),
  };
}

function parseContractTransitions(contract: unknown): TransitionResolver {
  const fallbackInitialState = "draft";
  if (!isRecord(contract)) {
    return {
      initialState: fallbackInitialState,
      states: new Set([fallbackInitialState]),
      next: () => null,
    };
  }

  const initialState =
    typeof contract.initial_state === "string" && contract.initial_state.length > 0
      ? contract.initial_state
      : fallbackInitialState;

  const states = new Set<string>([initialState]);
  const transitions = new Map<string, Map<string, string>>();

  const contractStates = contract.states;
  if (Array.isArray(contractStates)) {
    for (const candidate of contractStates) {
      if (isRecord(candidate) && typeof candidate.id === "string") {
        states.add(candidate.id);
      }
    }
  } else if (isRecord(contractStates)) {
    for (const [state, definition] of Object.entries(contractStates)) {
      states.add(state);
      if (!isRecord(definition) || !isRecord(definition.on)) {
        continue;
      }
      for (const [event, target] of Object.entries(definition.on)) {
        const to = Array.isArray(target) ? target.find((entry) => typeof entry === "string") : target;
        if (typeof to !== "string") {
          continue;
        }
        states.add(to);
        const byEvent = transitions.get(state) ?? new Map<string, string>();
        byEvent.set(event, to);
        transitions.set(state, byEvent);
      }
    }
  }

  const contractTransitions = contract.transitions;
  if (Array.isArray(contractTransitions)) {
    for (const transition of contractTransitions) {
      if (!isRecord(transition)) {
        continue;
      }
      const from = typeof transition.from === "string" ? transition.from : null;
      const to = typeof transition.to === "string" ? transition.to : null;
      const event = typeof transition.event === "string" ? transition.event : null;
      if (!from || !to || !event) {
        continue;
      }
      states.add(from);
      states.add(to);
      const byEvent = transitions.get(from) ?? new Map<string, string>();
      byEvent.set(event, to);
      transitions.set(from, byEvent);
    }
  }

  return {
    initialState,
    states,
    next: (state: string, event: string) => transitions.get(state)?.get(event) ?? null,
  };
}

function fixtureFor(name: DevSimFixture, resolver: TransitionResolver): RuntimeFixture {
  const initialState = resolver.initialState;
  const reviewState = pickState(resolver.states, ["review", "pending_review"], initialState);
  const completedState = pickState(resolver.states, ["done", "completed", "live"], reviewState);

  const fixtures: Record<DevSimFixture, RuntimeFixture> = {
    "live-install-ready": {
      install: { state: "live", revision: 4 },
      instances: [
        {
          id: "inst-live-1",
          state: completedState,
          revision: 3,
          actor: "human",
          metadata: { source: "fixture" },
        },
      ],
    },
    "pending-review": {
      install: { state: "draft", revision: 1 },
      instances: [
        {
          id: "inst-review-1",
          state: reviewState,
          revision: 1,
          actor: "human",
          metadata: { queue: "review" },
        },
      ],
    },
    "pending-agent": {
      install: { state: "validated", revision: 2 },
      instances: [
        {
          id: "inst-agent-1",
          state: initialState,
          revision: 2,
          actor: "agent",
          metadata: { queue: "agent" },
        },
      ],
    },
    "revision-mismatch": {
      install: { state: "tested", revision: 3 },
      instances: [
        {
          id: "inst-revision-1",
          state: reviewState,
          revision: 7,
          actor: "human",
          metadata: { queue: "review", expected_revision: 7 },
        },
      ],
    },
  };

  return fixtures[name];
}

export class SimulatedStudioMachine {
  private readonly resolver: TransitionResolver;
  private fixtureName: DevSimFixture;
  private install: SimulatedInstallSnapshot = { state: "draft", revision: 1 };
  private readonly instances = new Map<string, SimulatedInstanceSnapshot>();

  public constructor(contract: unknown, initialFixture: DevSimFixture = "live-install-ready") {
    this.resolver = parseContractTransitions(contract);
    this.fixtureName = initialFixture;
    this.applyFixture(initialFixture);
  }

  public listFixtures(): readonly DevSimFixture[] {
    return DEV_SIM_FIXTURES;
  }

  public applyFixture(requestedFixture: string): TransitionResult<SimulatedRuntimeSnapshot> {
    if (!DEV_SIM_FIXTURES.includes(requestedFixture as DevSimFixture)) {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_FIXTURE",
          message: `Unknown fixture '${requestedFixture}'`,
          hint: { fixtures: DEV_SIM_FIXTURES },
        },
      };
    }

    const fixture = requestedFixture as DevSimFixture;
    this.fixtureName = fixture;
    const snapshot = fixtureFor(fixture, this.resolver);
    this.install = { ...snapshot.install };
    this.instances.clear();
    for (const instance of snapshot.instances) {
      this.instances.set(instance.id, { ...instance, metadata: { ...instance.metadata } });
    }
    return { ok: true, value: this.snapshot() };
  }

  public snapshot(): SimulatedRuntimeSnapshot {
    const instances = Array.from(this.instances.values()).map((instance) => ({
      ...instance,
      metadata: { ...instance.metadata },
    }));
    return cloneSnapshot({
      fixture: this.fixtureName,
      install: { ...this.install },
      instances,
    });
  }

  public transitionInstall(action: string): TransitionResult<SimulatedInstallSnapshot> {
    const nextState = INSTALL_TRANSITIONS[this.install.state][action];
    if (!nextState) {
      return {
        ok: false,
        error: {
          code: "INVALID_INSTALL_TRANSITION",
          message: `Install cannot '${action}' while in '${this.install.state}'`,
          hint: { state: this.install.state, action },
        },
      };
    }
    this.install = { state: nextState, revision: this.install.revision + 1 };
    return { ok: true, value: { ...this.install } };
  }

  public transitionInstance(
    instanceId: string,
    event: string,
    opts?: { expectedRevision?: number; actor?: "agent" | "human" },
  ): TransitionResult<SimulatedInstanceSnapshot> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        ok: false,
        error: {
          code: "INSTANCE_NOT_FOUND",
          message: `Instance '${instanceId}' does not exist in simulator`,
          hint: { instance_id: instanceId },
        },
      };
    }

    if (
      typeof opts?.expectedRevision === "number" &&
      opts.expectedRevision !== instance.revision
    ) {
      return {
        ok: false,
        error: {
          code: "REVISION_MISMATCH",
          message: `Expected revision ${opts.expectedRevision}, current revision is ${instance.revision}`,
          hint: {
            instance_id: instance.id,
            expected_revision: opts.expectedRevision,
            actual_revision: instance.revision,
          },
        },
      };
    }

    const nextState = this.resolver.next(instance.state, event);
    if (!nextState) {
      return {
        ok: false,
        error: {
          code: "INVALID_INSTANCE_TRANSITION",
          message: `No transition for event '${event}' from state '${instance.state}'`,
          hint: {
            instance_id: instance.id,
            event,
            from_state: instance.state,
          },
        },
      };
    }

    const updated: SimulatedInstanceSnapshot = {
      ...instance,
      state: nextState,
      actor: opts?.actor ?? instance.actor,
      revision: instance.revision + 1,
    };
    this.instances.set(instance.id, updated);
    return { ok: true, value: { ...updated, metadata: { ...updated.metadata } } };
  }
}

export function parseExpectedRevision(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function parseInstanceActor(value: unknown): "agent" | "human" | undefined {
  if (value === "agent" || value === "human") {
    return value;
  }
  return undefined;
}

export function parseFixture(value: unknown): DevSimFixture | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return DEV_SIM_FIXTURES.includes(value as DevSimFixture) ? (value as DevSimFixture) : undefined;
}

export function parseEventsFromMetadata(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return toStringArray(value.events);
}

