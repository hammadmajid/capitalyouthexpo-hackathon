import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { notifications } from '@hsm/db';
import { lockActor } from '../auth/actor-lock.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { InboxRepository } from './repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  now = new Date('2026-10-14T12:00:00Z');
const id = randomUUID();
const notice = {
  id,
  type: 'account.email_verified',
  title: 'Email verified',
  body: 'Account notice',
  readAt: null,
  createdAt: now,
  privateData: 'Must not be returned',
};
beforeEach(() => {
  vi.clearAllMocks();
});
it('NTF-002 SEC-003: inbox reads own rows and excludes raw data with a real unread count', async () => {
  const fixture = queryFixture();
  fixture.enqueue(notifications, [notice], [{ value: 1 }]);
  const result = await new InboxRepository(fixture.database, () => now).read(actor, { limit: 20 });
  expect(result).toEqual({
    data: [
      {
        id,
        type: notice.type,
        title: notice.title,
        body: notice.body,
        readAt: null,
        createdAt: now.toISOString(),
      },
    ],
    nextCursor: null,
    unreadCount: 1,
  });
  expect(lockActor).toHaveBeenCalledWith(fixture.transaction, actor, expect.any(Function));
  for (const predicate of fixture.predicates)
    expect(new PgDialect().sqlToQuery(predicate.value).params).toContain(actor.userId);
});
it('NTF-002: chronological cursor pages keep exact ownership and a continuation cursor', async () => {
  const fixture = queryFixture(),
    otherId = randomUUID();
  fixture.enqueue(
    notifications,
    [{ id, createdAt: now }],
    [notice, { ...notice, id: otherId }],
    [{ value: 2 }],
  );
  const result = await new InboxRepository(fixture.database, () => now).read(actor, {
    limit: 1,
    cursor: id,
  });
  expect(result.data).toHaveLength(1);
  expect(result.nextCursor).toBe(id);
  expect(result.unreadCount).toBe(2);
});
it('SEC-003: foreign or absent notification cursors cannot reveal a page', async () => {
  const fixture = queryFixture();
  fixture.enqueue(notifications, []);
  await expect(
    new InboxRepository(fixture.database).read(actor, { cursor: id, limit: 20 }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(fixture.predicates).toHaveLength(1);
});
it('NTF-002: empty inbox is a genuine zero count, not an invented notice', async () => {
  const fixture = queryFixture();
  fixture.enqueue(notifications, [], []);
  expect(await new InboxRepository(fixture.database).read(actor, { limit: 20 })).toEqual({
    data: [],
    nextCursor: null,
    unreadCount: 0,
  });
});
it('NTF-002 SEC-003: read state is monotonic and foreign IDs never mutate', async () => {
  const fixture = queryFixture(),
    repository = new InboxRepository(fixture.database, () => now);
  fixture.enqueue(notifications, [{ id, readAt: null }], [], [{ id, readAt: now }], []);
  expect(await repository.markRead(fixture.transaction, actor, id)).toEqual({
    id,
    readAt: now.toISOString(),
  });
  expect(await repository.markRead(fixture.transaction, actor, id)).toEqual({
    id,
    readAt: now.toISOString(),
  });
  expect(fixture.writes).toHaveLength(1);
  await expect(repository.markRead(fixture.transaction, actor, randomUUID())).rejects.toMatchObject(
    { code: 'NOT_FOUND' },
  );
  expect(fixture.writes).toHaveLength(1);
});
