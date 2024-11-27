import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import {
  branches,
  brands,
  chatMessages,
  conversations,
  notificationOutbox,
  organizations,
  users,
} from '@hsm/db';
import { CHAT_REALTIME_CHANNEL } from '@hsm/contracts';
import { ChatRealtimeDelivery } from '../src/chat-realtime.js';
import { OutboxRepository } from '../src/repository.js';
import { workerFixture } from './fixture.js';
let f: Awaited<ReturnType<typeof workerFixture>>;
let publisher: Redis, subscriber: Redis;
beforeAll(async () => {
  f = await workerFixture();
  publisher = new Redis(f.redisUrl);
  subscriber = new Redis(f.redisUrl);
  await subscriber.subscribe(CHAT_REALTIME_CHANNEL);
});
afterAll(async () => {
  publisher?.disconnect();
  subscriber?.disconnect();
  await f?.close();
});
async function pending() {
  const db = f.database.db,
    userId = randomUUID(),
    organizationId = randomUUID(),
    brandId = randomUUID(),
    branchId = randomUUID(),
    conversationId = randomUUID(),
    messageId = randomUUID(),
    outboxId = randomUUID();
  await db.insert(users).values({ id: userId, fullName: 'Chat participant' });
  await db
    .insert(organizations)
    .values({ id: organizationId, ownerUserId: userId, name: 'Chat hostel' });
  await db.insert(brands).values({ id: brandId, organizationId, name: 'Chat hostel' });
  await db
    .insert(branches)
    .values({ id: branchId, brandId, organizationId, name: 'Chat branch', slug: branchId });
  await db.insert(conversations).values({ id: conversationId, branchId, customerUserId: userId });
  const [message] = await db
    .insert(chatMessages)
    .values({
      id: messageId,
      conversationId,
      senderUserId: userId,
      senderSide: 'customer',
      body: 'Private durable message',
    })
    .returning();
  await db.insert(notificationOutbox).values({
    id: outboxId,
    eventType: 'chat.realtime',
    channel: 'internal',
    payload: { event: 'chat.message.created', messageId },
    dedupeKey: 'chat.realtime:' + messageId,
    nextAttemptAt: new Date(Date.now() - 1000),
  });
  const repository = new OutboxRepository(db),
    lease = await repository.claim(outboxId, new Date());
  if (!lease || !message) throw new Error('Missing realtime fixture');
  return { lease, message, repository };
}
it('COMM-001 / ACC-006: Redis publication excludes content, acknowledges once and ignores stale retries', async () => {
  const { lease, message } = await pending(),
    event = once(subscriber, 'message'),
    delivery = new ChatRealtimeDelivery(f.database.db, publisher);
  await delivery.deliver(lease);
  const received = await event;
  expect(received).toEqual([
    CHAT_REALTIME_CHANNEL,
    JSON.stringify({
      conversationId: message.conversationId,
      messageId: message.id,
      createdAt: message.createdAt.toISOString(),
    }),
  ]);
  const [row] = await f.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, lease.id));
  expect(row).toMatchObject({ status: 'sent', leaseToken: null, leaseExpiresAt: null });
  const publish = vi.fn();
  await new ChatRealtimeDelivery(f.database.db, { publish }).deliver(lease);
  expect(publish).not.toHaveBeenCalled();
});
it('COMM-001 / NTF-002: unavailable Redis rolls acknowledgement back; the same lease can retry safely', async () => {
  const { lease } = await pending();
  await expect(
    new ChatRealtimeDelivery(f.database.db, {
      publish: vi.fn().mockRejectedValue(new Error('unavailable')),
    }).deliver(lease),
  ).rejects.toThrow('unavailable');
  const [row] = await f.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, lease.id));
  expect(row).toMatchObject({ status: 'pending', leaseToken: lease.leaseToken });
  await new ChatRealtimeDelivery(f.database.db, publisher).deliver(lease);
  const [sent] = await f.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, lease.id));
  expect(sent?.status).toBe('sent');
});
it('COMM-001: removed message suppresses publication while acknowledging the durable source', async () => {
  const { lease, message } = await pending();
  await f.database.db
    .update(chatMessages)
    .set({ deletedAt: new Date() })
    .where(eq(chatMessages.id, message.id));
  const publish = vi.fn();
  await new ChatRealtimeDelivery(f.database.db, { publish }).deliver(lease);
  expect(publish).not.toHaveBeenCalled();
});
