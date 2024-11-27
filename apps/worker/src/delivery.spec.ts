import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { sealEnvelope } from '@hsm/security/envelope';
import { deliverEmail } from './delivery.js';
import type { OutboxMessage } from './repository.js';
const key = randomBytes(32);
const now = new Date('2026-10-07T12:00:00.000Z');
function message(payload: unknown, eventType = 'auth.otp'): OutboxMessage {
  return {
    id: randomUUID(),
    eventType,
    channel: 'email',
    recipientUserId: null,
    recipientAddress: 'person@example.test',
    payload: { envelope: sealEnvelope(JSON.stringify(payload), key, 'email').toString('base64') },
    dedupeKey: randomUUID(),
    status: 'pending',
    attempts: 1,
    nextAttemptAt: now,
    lastError: null,
    providerMessageId: null,
    createdAt: now,
    sentAt: null,
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(now.getTime() + 60000),
  };
}
const payload = {
  email: 'person@example.test',
  code: '482731',
  purpose: 'signup_verify',
  expiresAt: '2026-10-07T12:10:00.000Z',
};
it('AUTH-C-002: authenticated email renders and sends a stable message ID', async () => {
  const send = vi.fn().mockResolvedValue('provider-id');
  const row = message(payload);
  await expect(deliverEmail(row, key, { send }, now)).resolves.toBe('provider-id');
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: payload.email,
      text: expect.stringContaining(payload.code),
      messageId: '<' + row.id + '@outbox.hsm.invalid>',
    }),
  );
  await deliverEmail(
    message({ email: payload.email, name: 'Manager' }, 'manager.welcome'),
    key,
    { send },
    now,
  );
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ subject: 'Your manager invitation' }),
  );
});
it('SEC: expired OTPs cannot reach SMTP', async () => {
  const send = vi.fn();
  await expect(
    deliverEmail(message({ ...payload, expiresAt: now.toISOString() }), key, { send }, now),
  ).rejects.toThrow('EXPIRED_MESSAGE');
  expect(send).not.toHaveBeenCalled();
});
it('SEC: mismatched, unknown and unauthenticated messages never reach SMTP', async () => {
  const send = vi.fn();
  const rows = [
    message({ ...payload, email: 'other@example.test' }),
    message({ email: 'other@example.test', name: 'Manager' }, 'manager.welcome'),
    message(payload, 'unknown'),
    { ...message(payload), channel: 'push' as const },
    { ...message(payload), recipientAddress: null },
    { ...message(payload), payload: { envelope: 'invalid' } },
    message({ code: payload.code }),
  ];
  for (const row of rows)
    await expect(deliverEmail(row, key, { send }, now)).rejects.toThrow('INVALID_MESSAGE');
  await expect(deliverEmail(message(payload), randomBytes(32), { send }, now)).rejects.toThrow(
    'INVALID_MESSAGE',
  );
  expect(send).not.toHaveBeenCalled();
});
it('SEC: provider errors remain delivery failures', async () => {
  const send = vi.fn().mockRejectedValue(new Error('DELIVERY_FAILED'));
  await expect(deliverEmail(message(payload), key, { send }, now)).rejects.toThrow(
    'DELIVERY_FAILED',
  );
});

it('AUTH-M CHG-006: authenticated association OTP renders through the existing encrypted delivery path', async () => {
  const send = vi.fn().mockResolvedValue('association-delivery');
  await expect(
    deliverEmail(message({ ...payload, purpose: 'email_change' }), key, { send }, now),
  ).resolves.toBe('association-delivery');
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: payload.email,
      subject: 'Verify your email',
      text: expect.stringContaining(payload.code),
    }),
  );
});
