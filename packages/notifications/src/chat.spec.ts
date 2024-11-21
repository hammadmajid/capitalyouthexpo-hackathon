import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  branches,
  chatMessages,
  managerAssignments,
  notificationOutbox,
  notifications,
  users,
} from '@hsm/db';
import {
  InvalidNotificationJob,
  NotificationService,
  type ChatLifecycleLease,
  type NotificationLease,
  type NotificationStore,
} from './index.js';
import {
  waitlistFixture,
  now,
  lease as originalLease,
  branchId,
  customerId,
} from '../test/waitlist.fixture.js';
const ownerId = randomUUID(),
  managerId = randomUUID(),
  messageId = randomUUID();
const lease: ChatLifecycleLease = {
  ...originalLease,
  eventType: 'chat.lifecycle',
  payload: { event: 'chat.message.created', messageId },
};
function fixture(patch: Partial<typeof notificationOutbox.$inferSelect> = {}) {
  const f = waitlistFixture({ ...lease, ...patch });
  f.data.set(chatMessages, [
    { branchId, customerId, senderId: customerId, senderSide: 'customer', deletedAt: null },
  ]);
  f.data.set(branches, [{ id: ownerId }]);
  f.data.set(managerAssignments, [{ id: managerId }, { id: ownerId }, { id: customerId }]);
  f.data.set(users, [{ id: ownerId }]);
  return f;
}
it('COMM-001 / NTF-002: lifecycle targets current branch participants, excludes sender and deduplicates roles', async () => {
  const f = fixture();
  expect(await f.repository.publishChat(lease, now)).toBe(true);
  expect(f.writes.slice(0, -1).map((write) => write.value)).toEqual(
    [ownerId, managerId].sort().map((recipientUserId) =>
      expect.objectContaining({
        recipientUserId,
        payload: { event: 'chat.message.created', operationId: messageId },
      }),
    ),
  );
  expect(f.writes.at(-1)?.value).toMatchObject({
    eventType: 'chat.realtime',
    channel: 'internal',
    recipientUserId: null,
    payload: lease.payload,
  });
  expect(f.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
});
it('COMM-001: hostel replies notify only the source Customer', async () => {
  const f = fixture();
  f.data.set(chatMessages, [
    { branchId, customerId, senderId: ownerId, senderSide: 'branch', deletedAt: null },
  ]);
  expect(await f.repository.publishChat(lease, now)).toBe(true);
  expect(f.writes).toHaveLength(2);
  expect(f.writes[0]?.value).toMatchObject({ recipientUserId: customerId });
});
it.each([
  { status: 'sent' as const },
  { status: 'dead' as const },
  { eventType: 'unknown' },
  { channel: 'email' as const },
  { recipientUserId: ownerId },
  { leaseToken: randomUUID() },
  { leaseExpiresAt: null },
  { leaseExpiresAt: now },
  { payload: {} },
  { payload: { ...lease.payload, messageId: randomUUID() } },
])('COMM-001: invalid/stale persisted leases cannot fan out', async (patch) => {
  const f = fixture(patch);
  expect(await f.repository.publishChat(lease, now)).toBe(false);
  expect(f.writes).toHaveLength(0);
  expect(f.set).not.toHaveBeenCalled();
});
it('COMM-002: missing message source cannot fabricate recipient authority', async () => {
  const f = fixture();
  f.data.set(chatMessages, []);
  await expect(f.repository.publishChat(lease, now)).rejects.toBeInstanceOf(InvalidNotificationJob);
  const missing = fixture();
  missing.data.set(notificationOutbox, []);
  expect(await missing.repository.publishChat(lease, now)).toBe(false);
});
it.each([chatMessages, branches, users])(
  'COMM-001: removed messages, archived scope and inactive accounts suppress alerts',
  async (table) => {
    const f = fixture();
    if (table === chatMessages)
      f.data.set(chatMessages, [
        { branchId, customerId, senderId: customerId, senderSide: 'customer', deletedAt: now },
      ]);
    else f.data.set(table, []);
    expect(await f.repository.publishChat(lease, now)).toBe(true);
    expect(f.writes).toHaveLength(1);
  },
);
it('NTF-002: lease expiry during fanout aborts acknowledgement', async () => {
  const f = fixture();
  f.expireAfterInsert();
  await expect(f.repository.publishChat(lease, now)).rejects.toThrow('lease expired');
  expect(f.set).not.toHaveBeenCalled();
});
it('COMM-001 / SEC-003: final inbox notice checks current message participant authority', async () => {
  const input: NotificationLease = {
    ...lease,
    eventType: 'notification.create',
    recipientUserId: ownerId,
    payload: { event: 'chat.message.created', operationId: messageId },
  };
  const f = fixture(input);
  expect(await f.repository.publish(input, now)).toBe(true);
  expect(f.writes.filter((row) => row.table === notifications)).toHaveLength(1);
  const stranger = randomUUID(),
    foreign = fixture({ ...input, recipientUserId: stranger });
  expect(await foreign.repository.publish({ ...input, recipientUserId: stranger }, now)).toBe(true);
  expect(foreign.writes).toHaveLength(0);
});
it('COMM-001: chat lifecycle delivery uses the explicit source-validating port and rejects injected recipients', async () => {
  const publishChat = vi.fn().mockResolvedValue(true),
    store: NotificationStore = {
      publish: vi.fn(),
      publishBooking: vi.fn(),
      publishResident: vi.fn(),
      publishChat,
    };
  const service = new NotificationService(store, () => now);
  await service.deliver(lease);
  expect(publishChat).toHaveBeenCalledWith(lease, now);
  expect(store.publish).not.toHaveBeenCalled();
  await service.deliver({ ...lease, leaseExpiresAt: now });
  expect(publishChat).toHaveBeenCalledTimes(1);
  await expect(service.deliver({ ...lease, recipientUserId: ownerId })).rejects.toBeInstanceOf(
    InvalidNotificationJob,
  );
  delete store.publishChat;
  await expect(service.deliver(lease)).rejects.toBeInstanceOf(InvalidNotificationJob);
});
