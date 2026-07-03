export interface EmailMessage {
  to_actor_id: string;
  subject: string;
  body_text: string;
  html_link?: string;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailAdapterLog {
  info(message: string, meta?: Record<string, unknown>): void;
}

/** Dev/test default — logs instead of sending. */
export function createNoopEmailAdapter(log: EmailAdapterLog = console): EmailAdapter {
  return {
    async send(message) {
      log.info("out-of-shell email (noop)", {
        to_actor_id: message.to_actor_id,
        subject: message.subject,
        html_link: message.html_link,
      });
    },
  };
}

export interface SmtpEmailConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  /** Optional fetch-based relay when direct SMTP is unavailable in runtime. */
  webhook_url?: string;
}

/** SMTP config via env or webhook POST; falls back to noop when unset. */
export function createEmailAdapterFromConfig(
  config: Partial<SmtpEmailConfig> | undefined,
  log: EmailAdapterLog = console,
): EmailAdapter {
  if (config?.webhook_url) {
    return createWebhookEmailAdapter(config.webhook_url);
  }
  if (config?.host && config.from) {
    return createSmtpEmailAdapter(config as SmtpEmailConfig, log);
  }
  return createNoopEmailAdapter(log);
}

export function createWebhookEmailAdapter(webhook_url: string): EmailAdapter {
  return {
    async send(message) {
      const res = await fetch(webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (!res.ok) {
        throw new Error(`Email webhook failed: ${res.status}`);
      }
    },
  };
}

/** Log-only SMTP stand-in — records intent; wire real transport in hosted deployments. */
export function createSmtpEmailAdapter(config: SmtpEmailConfig, log: EmailAdapterLog = console): EmailAdapter {
  return {
    async send(message) {
      log.info("out-of-shell email (smtp)", {
        host: config.host,
        port: config.port,
        from: config.from,
        to_actor_id: message.to_actor_id,
        subject: message.subject,
        html_link: message.html_link,
      });
    },
  };
}

export function parseSmtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<SmtpEmailConfig> | undefined {
  const host = env.MURRMURE_SMTP_HOST;
  const from = env.MURRMURE_SMTP_FROM;
  const webhook = env.MURRMURE_EMAIL_WEBHOOK_URL;
  if (webhook) {
    return { webhook_url: webhook, host: host ?? "", port: Number(env.MURRMURE_SMTP_PORT ?? "587"), from: from ?? "murrmure@localhost" };
  }
  if (!host || !from) return undefined;
  return {
    host,
    port: Number(env.MURRMURE_SMTP_PORT ?? "587"),
    user: env.MURRMURE_SMTP_USER,
    pass: env.MURRMURE_SMTP_PASS,
    from,
  };
}
