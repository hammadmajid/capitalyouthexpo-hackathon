import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { chatMessages, notificationOutbox, type Database } from '@hsm/db';
import { ChatRealtimeDelivery, InvalidChatRealtimeJob } from './chat-realtime.js';
import type { OutboxMessage } from './repository.js';
const now = new Date('2026-10-24T10:00:00Z'),
  messageId = randomUUID();
function fixture(patch: Partial<OutboxMessage> = {}) {
  const row = {
    id: randomUUID(),
    eventType: 'chat.realtime',
    channel: 'internal',
    recipientUserId: null,
    status: 'pending',
    payload: { event: 'chat.message.created', messageId },
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(now.getTime() + 60000),
    ...patch,
  } as OutboxMessage;
  const data = new Map<unknown, unknown[]>([
    [notificationOutbox, [row]],
    [
      chatMessages,
      [{ id: messageId, conversationId: randomUUID(), createdAt: now, deletedAt: null }],
    ],
  ]);
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    publish = vi.fn().mockResolvedValue(1);
  let time = now,
    expireOnSourceRead = false;
  function select() {
    let table: unknown;
    const chain = {
      from(value: unknown) {
        table = value;
        return chain;
      },
      where() {
        return chain;
      },
      for() {
        return chain;
      },
      then(resolve: (rows: unknown[]) => unknown) {
        if (table === chatMessages && expireOnSourceRead) time = new Date(now.getTime() + 60000);
        return Promise.resolve(data.get(table) ?? []).then(resolve);
      },
    };
    return chain;
  }
  const tx = { select, update: () => ({ set }) };
  const db = {
    transaction: (work: (value: typeof tx) => Promise<void>) => work(tx),
  } as unknown as Database;
  const delivery = new ChatRealtimeDelivery(db, { publish }, () => time);
  return {
    db,
    row,
    data,
    publish,
    set,
    delivery,
    expireOnSourceRead: () => {
      expireOnSourceRead = true;
    },
    expire: () => {
      time = new Date(now.getTime() + 60000);
    },
  };
}
it('COMM-001: source event publishes only IDs and acknowledges its lease', async () => {
  const f = fixture();
  await f.delivery.deliver(f.row);
  expect(f.publish).toHaveBeenCalledOnce();
  expect(f.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', leaseToken: null }));
});
it.each([
  { status: 'sent' as const },
  { status: 'dead' as const },
  { eventType: 'other' },
  { channel: 'email' as const },
  { recipientUserId: randomUUID() },
  { leaseToken: null },
  { leaseExpiresAt: null },
  { leaseExpiresAt: now },
])('COMM-001: persisted invalid or expired leases cannot publish', async (patch) => {
  const f = fixture(patch);
  await f.delivery.deliver(f.row);
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.set).not.toHaveBeenCalled();
});
it('COMM-001: missing source, malformed payload and stale claim fail closed', async () => {
  const f = fixture();
  f.data.set(notificationOutbox, []);
  await f.delivery.deliver(f.row);
  expect(f.publish).not.toHaveBeenCalled();
  const stale = fixture();
  await stale.delivery.deliver({ ...stale.row, leaseToken: randomUUID() });
  expect(stale.publish).not.toHaveBeenCalled();
  const invalid = fixture({ payload: {} });
  await expect(invalid.delivery.deliver(invalid.row)).rejects.toBeInstanceOf(
    InvalidChatRealtimeJob,
  );
  const absent = fixture();
  absent.data.set(chatMessages, []);
  await expect(absent.delivery.deliver(absent.row)).rejects.toBeInstanceOf(InvalidChatRealtimeJob);
});
it('COMM-001 / NTF-002: deletion suppresses publication and expiry after publish cannot acknowledge', async () => {
  const f = fixture();
  f.data.set(chatMessages, [{ deletedAt: now }]);
  await f.delivery.deliver(f.row);
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.set).toHaveBeenCalled();
  const expired = fixture();
  expired.publish.mockImplementation(async () => {
    expired.expire();
    return 1;
  });
  await expect(expired.delivery.deliver(expired.row)).rejects.toThrow('Realtime lease expired');
  expect(expired.set).not.toHaveBeenCalled();
});
it('COMM-001 / NTF-002: Redis failure leaves acknowledgement untouched', async () => {
  const f = fixture();
  f.publish.mockRejectedValue(new Error('offline'));
  await expect(f.delivery.deliver(f.row)).rejects.toThrow('offline');
  expect(f.set).not.toHaveBeenCalled();
});
it('COMM-001 / NTF-002: expiry during source lookup prevents publication; default production clock rejects old leases', async () => {
  const f = fixture();
  f.expireOnSourceRead();
  await expect(f.delivery.deliver(f.row)).rejects.toThrow('Realtime lease expired');
  expect(f.publish).not.toHaveBeenCalled();
  const old = fixture();
  await new ChatRealtimeDelivery(old.db, { publish: old.publish }).deliver(old.row);
  expect(old.publish).not.toHaveBeenCalled();
});
