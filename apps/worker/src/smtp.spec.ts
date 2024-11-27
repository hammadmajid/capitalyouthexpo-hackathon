import { beforeEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.create } }));
import { smtpProvider } from './smtp.js';
import { workerConfig } from './config.js';
const config = workerConfig({
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  EMAIL_ENVELOPE_KEY: randomBytes(32).toString('hex'),
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_FROM: 'no-reply@example.test',
});
const message = {
  to: 'person@example.test',
  subject: 'Verification',
  html: '<p>Body</p>',
  text: 'Body',
  messageId: '<message@example.test>',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
});
it('SEC: SMTP disables remote/file content, verifies TLS and preserves stable message IDs', async () => {
  mocks.sendMail.mockResolvedValue({ accepted: [message.to], rejected: [] });
  const provider = smtpProvider(config);
  await expect(provider.send(message)).resolves.toBe(message.messageId);
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      disableFileAccess: true,
      disableUrlAccess: true,
      tls: { rejectUnauthorized: true },
      logger: false,
      debug: false,
    }),
  );
  expect(mocks.sendMail).toHaveBeenCalledWith({ ...message, from: config.SMTP_FROM });
  provider.close();
  expect(mocks.close).toHaveBeenCalled();
  smtpProvider({ ...config, SMTP_USER: 'sender', SMTP_PASSWORD: 'secret', SMTP_REQUIRE_TLS: true });
  expect(mocks.create).toHaveBeenLastCalledWith(
    expect.objectContaining({ auth: { user: 'sender', pass: 'secret' }, requireTLS: true }),
  );
});
it.each([
  { accepted: [], rejected: [message.to] },
  { accepted: [], rejected: [] },
  { accepted: [message.to, 'other@example.test'], rejected: [] },
])(
  'SEC: partial or absent SMTP acceptance fails without exposing recipients: %j',
  async (result) => {
    mocks.sendMail.mockResolvedValue(result);
    await expect(smtpProvider(config).send(message)).rejects.toThrow(/^DELIVERY_FAILED$/);
  },
);
it('SEC: SMTP errors never expose provider text or credentials', async () => {
  mocks.sendMail.mockRejectedValue(new Error('Provider leaked person@example.test secret'));
  await expect(smtpProvider(config).send(message)).rejects.toThrow(/^DELIVERY_FAILED$/);
});
