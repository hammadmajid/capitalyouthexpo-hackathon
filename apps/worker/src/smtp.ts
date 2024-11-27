import nodemailer from 'nodemailer';
import type { EmailProvider } from './delivery.js';
import type { WorkerConfig } from './config.js';
export function smtpProvider(config: WorkerConfig): EmailProvider & { close(): void } {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: config.SMTP_REQUIRE_TLS,
    tls: { rejectUnauthorized: true },
    ...(config.SMTP_USER && config.SMTP_PASSWORD
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  return {
    async send(message) {
      try {
        const result = await transport.sendMail({ ...message, from: config.SMTP_FROM });
        if (result.rejected.length > 0 || result.accepted.length !== 1)
          throw new Error('DELIVERY_FAILED');
        return message.messageId;
      } catch {
        throw new Error('DELIVERY_FAILED');
      }
    },
    close: () => transport.close(),
  };
}
