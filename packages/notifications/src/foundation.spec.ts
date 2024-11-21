import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { notificationOutbox } from '@hsm/db';
import {
  NotificationProducer,
  NotificationService,
  InvalidNotificationJob,
  notificationEventSchema,
  enqueueNotificationSchema,
  renderNotification,
  type NotificationLease,
  type NotificationTransaction,
  type NotificationStore,
} from './index.js';
const now = new Date('2026-10-08T12:00:00Z');
const event = {
  userId: randomUUID(),
  event: 'account.email_verified' as const,
  operationId: randomUUID(),
};
const lease: NotificationLease = {
  id: randomUUID(),
  eventType: 'notification.create',
  channel: 'in_app',
  recipientUserId: event.userId,
  payload: { event: event.event, operationId: event.operationId },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
afterEach(() => vi.useRealTimers());
it.each(notificationEventSchema.options)(
  'NTF-002: %s renders a fixed notice without identity, credentials or inaccessible links',
  (type) => {
    const rendered = renderNotification(type);
    expect(rendered.type).toBe(type);
    expect(rendered.title.length).toBeGreaterThan(0);
    expect(rendered.body.length).toBeGreaterThan(0);
    expect(rendered.data).toEqual({});
    expect(rendered.deepLink).toBeNull();
  },
);
it.each([
  { ...event, userId: 'foreign' },
  { ...event, operationId: 'invalid' },
  { ...event, event: 'unknown' },
  { ...event, body: 'Client supplied content' },
])('NTF-002: producer boundaries reject malformed or caller-injected content', (input) => {
  expect(enqueueNotificationSchema.safeParse(input).success).toBe(false);
});
it('NTF-002: producer persists only IDs and template type in the caller transaction, with a stable recipient-bound key', async () => {
  const insert = vi.fn(),
    values = vi.fn(),
    conflict = vi.fn().mockResolvedValue(undefined);
  insert.mockReturnValue({ values });
  values.mockReturnValue({ onConflictDoNothing: conflict });
  const transaction = { insert } as unknown as NotificationTransaction;
  await new NotificationProducer().enqueue(transaction, event, now);
  expect(insert).toHaveBeenCalledWith(notificationOutbox);
  expect(values).toHaveBeenCalledWith({
    eventType: 'notification.create',
    channel: 'in_app',
    recipientUserId: event.userId,
    payload: { event: event.event, operationId: event.operationId },
    dedupeKey: 'in_app:' + event.userId + ':' + event.event + ':' + event.operationId,
    createdAt: now,
    nextAttemptAt: now,
  });
  expect(conflict).toHaveBeenCalledWith({ target: notificationOutbox.dedupeKey });
  conflict.mockRejectedValueOnce(new Error('Outbox unavailable'));
  await expect(new NotificationProducer().enqueue(transaction, event, now)).rejects.toThrow(
    'Outbox unavailable',
  );
});
it('NTF-002: producer rejects untrusted input before any database write', async () => {
  const insert = vi.fn();
  await expect(
    new NotificationProducer().enqueue(
      { insert } as unknown as NotificationTransaction,
      { ...event, userId: 'invalid' },
      now,
    ),
  ).rejects.toThrow();
  expect(insert).not.toHaveBeenCalled();
});
it('NTF-002: delivery projects the persisted lease, accepts unrelated DB metadata and uses its default live clock', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const publish = vi.fn<NotificationStore['publish']>().mockResolvedValue(true);
  const input = { ...lease, attempts: 1, recipientAddress: null };
  await new NotificationService({
    publish,
    publishBooking: vi.fn<NotificationStore['publishBooking']>().mockResolvedValue(true),
    publishResident: vi.fn<NotificationStore['publishResident']>().mockResolvedValue(true),
  }).deliver(input);
  expect(publish).toHaveBeenCalledWith(lease, now);
});
it('NTF-002: expired delivery does not publish and provider/storage transaction errors propagate for retry', async () => {
  const publish = vi
    .fn<NotificationStore['publish']>()
    .mockRejectedValue(new Error('Database unavailable'));
  const service = new NotificationService(
    {
      publish,
      publishBooking: vi.fn<NotificationStore['publishBooking']>().mockResolvedValue(true),
      publishResident: vi.fn<NotificationStore['publishResident']>().mockResolvedValue(true),
    },
    () => now,
  );
  await service.deliver({ ...lease, leaseExpiresAt: now });
  expect(publish).not.toHaveBeenCalled();
  await expect(service.deliver(lease)).rejects.toThrow('Database unavailable');
});
it.each([
  { ...lease, channel: 'email' },
  { ...lease, eventType: 'unknown' },
  { ...lease, recipientUserId: null },
  { ...lease, leaseToken: null },
  { ...lease, payload: { ...lease.payload, envelope: 'forbidden' } },
])('NTF-002: malformed leases are typed invalid messages before any publication', async (input) => {
  const publish = vi.fn();
  await expect(
    new NotificationService(
      {
        publish,
        publishBooking: vi.fn<NotificationStore['publishBooking']>().mockResolvedValue(true),
        publishResident: vi.fn<NotificationStore['publishResident']>().mockResolvedValue(true),
      },
      () => now,
    ).deliver(input as NotificationLease),
  ).rejects.toBeInstanceOf(InvalidNotificationJob);
  expect(publish).not.toHaveBeenCalled();
});
it('NTF-002: runtime template boundaries reject unsupported event names', () => {
  expect(() => renderNotification('unknown' as typeof event.event)).toThrow();
});
