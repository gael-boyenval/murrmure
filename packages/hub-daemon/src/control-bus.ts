import { formatControlWake } from "./wake-prompt.js";

export interface ControlPrincipal {
  space_id: string;
  token_id: string;
  client_id: string;
}

export type ControlMessage =
  | {
      method: "murrmure/control.handshake_ack";
      params: { seq: number; server_tools: string[]; server_contract_versions?: Array<{ package_id: string; version: string; contract_ref_id: string }> };
    }
  | {
      method: "murrmure/control.tools_changed";
      params: { seq: number; space_id: string; added: string[]; removed: string[]; unchanged: string[] };
    }
  | {
      method: "murrmure/control.contract_updated";
      params: {
        seq: number;
        space_id: string;
        package_id: string;
        from_version: string;
        to_version: string;
        contract_ref_id: string;
      };
    }
  | {
      method: "murrmure/control.invoke_action";
      params: {
        seq: number;
        action_name: string;
        step_id?: string;
        run_id?: string;
        session_id?: string;
        params?: Record<string, unknown>;
        expect?: unknown;
        artifacts_in?: unknown;
        executor_id?: string;
        prompt?: string;
      };
    };

const TTL_MS = 24 * 60 * 60 * 1000;
type ControlMessageWithoutSeq = Omit<ControlMessage, "params"> & {
  params: Omit<ControlMessage["params"], "seq">;
};

function principalKey(p: ControlPrincipal): string {
  return `${p.space_id}:${p.token_id}:${p.client_id}`;
}

export class ControlBus {
  private readonly outboxes = new Map<string, { messages: ControlMessage[]; expiresAt: number }>();
  private readonly seq = new Map<string, number>();

  private nextSeq(key: string): number {
    const n = (this.seq.get(key) ?? 0) + 1;
    this.seq.set(key, n);
    return n;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, box] of this.outboxes) {
      if (box.expiresAt <= now) {
        this.outboxes.delete(key);
        this.seq.delete(key);
      }
    }
  }

  publish(principal: ControlPrincipal, msg: ControlMessageWithoutSeq): ControlMessage {
    this.purgeExpired();
    const key = principalKey(principal);
    const seq = this.nextSeq(key);
    const params = this.withRenderedPrompt(msg.method, msg.params);
    const full = { ...msg, params: { ...params, seq } } as ControlMessage;
    const box = this.outboxes.get(key) ?? { messages: [], expiresAt: Date.now() + TTL_MS };
    box.messages.push(full);
    box.expiresAt = Date.now() + TTL_MS;
    this.outboxes.set(key, box);
    return full;
  }

  drain(principal: ControlPrincipal, afterSeq = 0): ControlMessage[] {
    this.purgeExpired();
    const key = principalKey(principal);
    const box = this.outboxes.get(key);
    if (!box) return [];
    return box.messages.filter((m) => m.params.seq > afterSeq);
  }

  publishToolsChanged(
    principal: ControlPrincipal,
    spaceId: string,
    added: string[],
    removed: string[],
    unchanged: string[],
  ): ControlMessage {
    return this.publish(principal, {
      method: "murrmure/control.tools_changed",
      params: { space_id: spaceId, added, removed, unchanged },
    });
  }

  publishHandshakeAck(
    principal: ControlPrincipal,
    serverTools: string[],
    serverContractVersions?: Array<{ package_id: string; version: string; contract_ref_id: string }>,
  ): ControlMessage {
    return this.publish(principal, {
      method: "murrmure/control.handshake_ack",
      params: { server_tools: serverTools, server_contract_versions: serverContractVersions },
    });
  }

  listPrincipalsForSpace(spaceId: string): ControlPrincipal[] {
    const out: ControlPrincipal[] = [];
    for (const key of this.outboxes.keys()) {
      const [space_id, token_id, client_id] = key.split(":");
      if (space_id === spaceId) out.push({ space_id, token_id, client_id });
    }
    return out;
  }

  registerPrincipal(principal: ControlPrincipal): void {
    const key = principalKey(principal);
    if (!this.outboxes.has(key)) {
      this.outboxes.set(key, { messages: [], expiresAt: Date.now() + TTL_MS });
    }
  }

  private withRenderedPrompt(
    method: string,
    params: Omit<ControlMessage["params"], "seq">,
  ): Omit<ControlMessage["params"], "seq"> {
    const asRecord = params as Record<string, unknown>;
    if (typeof asRecord.prompt === "string" && asRecord.prompt.trim()) {
      return params;
    }
    const prompt = formatControlWake(method, asRecord);
    if (!prompt) return params;
    return { ...asRecord, prompt } as Omit<ControlMessage["params"], "seq">;
  }
}
