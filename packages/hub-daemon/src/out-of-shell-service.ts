import {
  createEmailAdapterFromConfig,
  parseSmtpConfigFromEnv,
  planOutOfShellDispatches,
  shouldDispatchOutOfShell,
  GateEmailRateLimiter,
  type EmailAdapter,
  type DesktopOutOfShellPayload,
} from "@murrmure/hub-core";
import { stripSpaceId } from "@murrmure/hub-core";
import type { SessionCreatedBy } from "@murrmure/contracts";
import type { DaemonContext } from "./context.js";
import { broadcastSse } from "./context.js";

function bareId(id: string): string {
  const idx = id.indexOf("_");
  return idx >= 0 ? id.slice(idx + 1) : id;
}

export interface OutOfShellService {
  handleJournalAppend(input: {
    type: string;
    space_id: string;
    session_id?: string;
    run_id?: string;
    actor_id: string;
    data: Record<string, unknown>;
  }): Promise<void>;
  sendTestNotification(actor_id: string): Promise<{ desktop: boolean; email: boolean }>;
}

export function createOutOfShellService(
  ctx: DaemonContext,
  options?: { emailAdapter?: EmailAdapter; rateLimiter?: GateEmailRateLimiter },
): OutOfShellService {
  const emailAdapter = options?.emailAdapter ?? createEmailAdapterFromConfig(parseSmtpConfigFromEnv());
  const rateLimiter = options?.rateLimiter ?? new GateEmailRateLimiter();
  const { murrmurePersistence: studio, config } = ctx;
  const shellBase = `http://${config.listenHost ?? "127.0.0.1"}:${config.port}`;

  async function dispatchPlans(plans: ReturnType<typeof planOutOfShellDispatches>) {
    for (const plan of plans) {
      if (plan.desktop) {
        broadcastSse(ctx, {
          event: "out_of_shell.desktop",
          data: plan.desktop as unknown as Record<string, unknown>,
        });
      }
      if (plan.email) {
        if (plan.gate_id && !rateLimiter.canSend(plan.gate_id)) continue;
        await emailAdapter.send({
          to_actor_id: plan.email.actor_id,
          subject: plan.email.subject,
          body_text: plan.email.body_text,
          html_link: plan.email.run_url,
        });
        if (plan.gate_id) rateLimiter.record(plan.gate_id);
      }
    }
  }

  return {
    async handleJournalAppend(input) {
      if (!shouldDispatchOutOfShell(input.type)) return;

      const spaceBare = stripSpaceId(input.space_id);
      const grants = await studio.listGrants(spaceBare);
      const space = await studio.getSpace(spaceBare);

      let session_actor_id: string | undefined;
      let created_by: SessionCreatedBy | undefined;
      if (input.session_id) {
        const session = await studio.getSession(bareId(input.session_id));
        session_actor_id = session?.actor_id;
        created_by = session?.created_by;
      }

      const actorPrefs = new Map<string, { notify_email?: boolean; notify_desktop?: boolean }>();
      const get_prefs = (actor_id: string) => {
        if (!actorPrefs.has(actor_id)) {
          throw new Error(`prefs not loaded for ${actor_id}`);
        }
        return actorPrefs.get(actor_id)!;
      };

      const draftPlans = planOutOfShellDispatches({
        event_type: input.type,
        space_id: input.space_id,
        session_id: input.session_id,
        run_id: input.run_id,
        actor_id: input.actor_id,
        data: input.data,
        grants,
        session_actor_id,
        created_by,
        space_name: space?.name ?? space?.slug,
        shell_base_url: shellBase,
        get_prefs: () => ({ notify_email: true, notify_desktop: true }),
      });

      for (const plan of draftPlans) {
        const prefs = await studio.getUserPrefs(plan.actor_id);
        actorPrefs.set(plan.actor_id, {
          notify_email: prefs?.notify_email !== false,
          notify_desktop: prefs?.notify_desktop !== false,
        });
      }

      const plans = planOutOfShellDispatches({
        event_type: input.type,
        space_id: input.space_id,
        session_id: input.session_id,
        run_id: input.run_id,
        actor_id: input.actor_id,
        data: input.data,
        grants,
        session_actor_id,
        created_by,
        space_name: space?.name ?? space?.slug,
        shell_base_url: shellBase,
        get_prefs,
      });

      await dispatchPlans(plans);
    },

    async sendTestNotification(actor_id: string) {
      const prefs = await studio.getUserPrefs(actor_id);
      const notifyDesktop = prefs?.notify_desktop !== false;
      const notifyEmail = prefs?.notify_email !== false;
      let desktop = false;
      let email = false;

      if (notifyDesktop) {
        const payload: DesktopOutOfShellPayload = {
          actor_id,
          kind: "gate",
          title: "Murrmure test notification",
          body: "Out-of-shell desktop push is working.",
          deep_link: "murrmure://notifications",
        };
        broadcastSse(ctx, { event: "out_of_shell.desktop", data: payload as unknown as Record<string, unknown> });
        desktop = true;
      }

      if (notifyEmail) {
        await emailAdapter.send({
          to_actor_id: actor_id,
          subject: "Murrmure test notification",
          body_text: "Out-of-shell email is configured.",
          html_link: shellBase,
        });
        email = true;
      }

      return { desktop, email };
    },
  };
}

export function wrapHandlerForOutOfShell(
  handler: {
    appendSpaceJournal: (input: {
      space_id: string;
      type: string;
      actor_id: string;
      token_id: string;
      session_id?: string;
      run_id?: string;
      data: Record<string, unknown>;
    }) => Promise<{ seq: number; entry_id: string }>;
  },
  service: OutOfShellService,
): void {
  const original = handler.appendSpaceJournal.bind(handler);
  handler.appendSpaceJournal = async (input: {
    space_id: string;
    type: string;
    actor_id: string;
    token_id: string;
    session_id?: string;
    run_id?: string;
    data: Record<string, unknown>;
  }) => {
    const result = await original(input);
    await service
      .handleJournalAppend({
        type: input.type,
        space_id: input.space_id,
        session_id: input.session_id,
        run_id: input.run_id,
        actor_id: input.actor_id,
        data: input.data,
      })
      .catch(() => undefined);
    return result;
  };
}
