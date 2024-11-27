import { InvalidResidentBillingJob } from '@hsm/db';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { InvalidScanJob } from '@hsm/files';
import { InvalidNotificationJob } from '@hsm/notifications';
import type { OutboxMessage, OutboxRepository } from './repository.js';
import { processDelivery } from './process-delivery.js';
const row = { id: randomUUID(), channel: 'internal', eventType: 'files.scan' } as OutboxMessage;
const repository = { sent: vi.fn(), failed: vi.fn() };
const provider = { send: vi.fn() };
const logger = { warn: vi.fn() } as unknown as Logger;
it('SEC-003: internal scan delivery owns transactional acknowledgement and never reaches SMTP', async () => {
  vi.clearAllMocks();
  const files = { deliver: vi.fn(async () => undefined) };
  await processDelivery(
    row,
    repository as unknown as OutboxRepository,
    provider,
    Buffer.alloc(32),
    logger,
    files,
  );
  expect(files.deliver).toHaveBeenCalledWith(row);
  expect(provider.send).not.toHaveBeenCalled();
  expect(repository.sent).not.toHaveBeenCalled();
});
it.each([
  { change: { eventType: 'unknown' }, expected: 'INVALID_MESSAGE' },
  { change: {}, expected: 'DELIVERY_FAILED' },
])(
  'SEC-003: unsupported internal events and unavailable scan service cannot acknowledge delivery',
  async ({ change, expected }) => {
    vi.clearAllMocks();
    await expect(
      processDelivery(
        { ...row, ...change },
        repository as unknown as OutboxRepository,
        provider,
        Buffer.alloc(32),
        logger,
      ),
    ).rejects.toThrow(expected);
    expect(repository.failed).toHaveBeenCalledWith(
      { ...row, ...change },
      expected,
      expect.any(Date),
    );
    expect(repository.sent).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  },
);
it('SEC-003: malformed scan jobs are dead-lettered using only the safe invalid-message code', async () => {
  vi.clearAllMocks();
  const files = {
    deliver: vi.fn(async () => {
      throw new InvalidScanJob();
    }),
  };
  await expect(
    processDelivery(
      row,
      repository as unknown as OutboxRepository,
      provider,
      Buffer.alloc(32),
      logger,
      files,
    ),
  ).rejects.toThrow('INVALID_MESSAGE');
  expect(repository.failed).toHaveBeenCalledWith(row, 'INVALID_MESSAGE', expect.any(Date));
});

it('NTF-002: in-app delivery owns atomic acknowledgement and never calls SMTP or a separate sent update', async () => {
  vi.clearAllMocks();
  const value = { ...row, channel: 'in_app' as const, eventType: 'notification.create' };
  const notices = { deliver: vi.fn(async () => undefined) };
  await processDelivery(
    value,
    repository as unknown as OutboxRepository,
    provider,
    Buffer.alloc(32),
    logger,
    undefined,
    notices,
  );
  expect(notices.deliver).toHaveBeenCalledWith(value);
  expect(repository.sent).not.toHaveBeenCalled();
  expect(provider.send).not.toHaveBeenCalled();
});
it.each([
  { error: undefined, expected: 'DELIVERY_FAILED' },
  { error: new InvalidNotificationJob(), expected: 'INVALID_MESSAGE' },
  { error: new Error('Private database detail'), expected: 'DELIVERY_FAILED' },
])(
  'NTF-002: missing in-app handler and typed/unknown failures use existing bounded retry or dead-letter policy',
  async ({ error, expected }) => {
    vi.clearAllMocks();
    const value = { ...row, channel: 'in_app' as const, eventType: 'notification.create' };
    const notices = error ? { deliver: vi.fn().mockRejectedValue(error) } : undefined;
    await expect(
      processDelivery(
        value,
        repository as unknown as OutboxRepository,
        provider,
        Buffer.alloc(32),
        logger,
        undefined,
        notices,
      ),
    ).rejects.toThrow(expected);
    expect(repository.failed).toHaveBeenCalledWith(value, expected, expect.any(Date));
    expect(repository.sent).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  },
);

it('RENT-004 / AUD-004: billing delivery owns atomic acknowledgement and never uses SMTP or a separate sent update', async () => {
  vi.clearAllMocks();
  const value = { ...row, eventType: 'resident.billing.period' };
  const billing = { deliver: vi.fn(async () => undefined) };
  await processDelivery(
    value,
    repository as unknown as OutboxRepository,
    provider,
    Buffer.alloc(32),
    logger,
    undefined,
    undefined,
    billing,
  );
  expect(billing.deliver).toHaveBeenCalledWith(value);
  expect(repository.sent).not.toHaveBeenCalled();
  expect(repository.failed).not.toHaveBeenCalled();
  expect(provider.send).not.toHaveBeenCalled();
});
it('RENT-004: unavailable billing service retries instead of discarding a supported internal event', async () => {
  vi.clearAllMocks();
  const value = { ...row, eventType: 'resident.billing.period' };
  await expect(
    processDelivery(
      value,
      repository as unknown as OutboxRepository,
      provider,
      Buffer.alloc(32),
      logger,
    ),
  ).rejects.toThrow('DELIVERY_FAILED');
  expect(repository.failed).toHaveBeenCalledWith(value, 'DELIVERY_FAILED', expect.any(Date));
  expect(repository.sent).not.toHaveBeenCalled();
});
it.each([
  { error: new InvalidResidentBillingJob(), expected: 'INVALID_MESSAGE' },
  { error: new Error('private failure detail'), expected: 'DELIVERY_FAILED' },
])(
  'RENT-004 / SEC-003: failed billing delivery %# publishes only its safe error classification',
  async ({ error, expected }) => {
    vi.clearAllMocks();
    const value = { ...row, eventType: 'resident.billing.period' };
    const billing = {
      deliver: vi.fn(async () => {
        throw error;
      }),
    };
    await expect(
      processDelivery(
        value,
        repository as unknown as OutboxRepository,
        provider,
        Buffer.alloc(32),
        logger,
        undefined,
        undefined,
        billing,
      ),
    ).rejects.toThrow(expected);
    expect(repository.failed).toHaveBeenCalledWith(value, expected, expect.any(Date));
    expect(repository.sent).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { code: expected, outboxId: value.id },
      'Notification delivery deferred or rejected',
    );
  },
);

it.each([false, true])(
  'AUD-008 / ADM-010: announcement delivery owns acknowledgement and retries safely after failure=%s',
  async (failure) => {
    vi.clearAllMocks();
    const value = { ...row, eventType: 'announcement.deliver' };
    const announcements = {
      deliver: failure
        ? vi.fn().mockRejectedValue(new Error('Private worker interruption'))
        : vi.fn().mockResolvedValue(true),
    };
    const running = processDelivery(
      value,
      repository as unknown as OutboxRepository,
      provider,
      Buffer.alloc(32),
      logger,
      undefined,
      undefined,
      undefined,
      undefined,
      announcements,
    );
    if (failure) {
      await expect(running).rejects.toThrow('DELIVERY_FAILED');
      expect(repository.failed).toHaveBeenCalledWith(value, 'DELIVERY_FAILED', expect.any(Date));
      expect(logger.warn).toHaveBeenCalledWith(
        { code: 'DELIVERY_FAILED', outboxId: value.id },
        'Notification delivery deferred or rejected',
      );
    } else {
      await running;
      expect(repository.failed).not.toHaveBeenCalled();
    }
    expect(announcements.deliver).toHaveBeenCalledWith(value);
    expect(repository.sent).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  },
);
