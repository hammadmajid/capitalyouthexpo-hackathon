import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { Redis } from 'ioredis';
import { eq, sql } from 'drizzle-orm';
import {
  AUTHORITY_CHANGE_CHANNEL,
  branches,
  listenAuthorityChanges,
  managerAssignments,
  users,
  type AuthorityChange,
} from '@hsm/db';
import { CHAT_REALTIME_CHANNEL, chatMessageSchema, conversationSchema } from '@hsm/contracts';
import { startChatRealtime } from '../../src/chat/realtime.js';
import { ChatRepository } from '../../src/chat/repository.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
let realtime: Awaited<ReturnType<typeof startChatRealtime>>;
let publisher: Redis;
let url: string;
const sockets: Socket[] = [];
function socketEvent(socket: Socket, event: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket event timed out: ' + event)), 10000);
    socket.once(event, (...values: unknown[]) => {
      clearTimeout(timer);
      resolve(values);
    });
  });
}
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-24T03:00:00Z'));
  realtime = await startChatRealtime(
    f.application.getHttpServer(),
    new ChatRepository(f.connection.db, 'auth-private-fixture', () => f.now),
    f.service,
    f.config,
    f.infrastructure,
  );
  await f.application.listen(0, '127.0.0.1');
  url = await f.application.getUrl();
  publisher = new Redis(f.config.REDIS_URL);
  await publisher.ping();
});
afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  publisher?.disconnect();
  await realtime?.close();
  await f?.close();
});
async function connect(token: string, browser = false) {
  const socket = io(url, {
    path: '/v1/rt',
    transports: browser ? ['polling'] : ['websocket'],
    autoConnect: false,
    reconnection: false,
    ...(browser
      ? { extraHeaders: { cookie: 'hsm_access=' + token, origin: 'http://localhost:3000' } }
      : { auth: { token } }),
  });
  sockets.push(socket);
  const connected = socketEvent(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}
async function conversation() {
  const scope = await f.inventory();
  const result = await f.application.inject({
    method: 'POST',
    url: '/v1/me/conversations',
    headers: { authorization: 'Bearer ' + f.customerAToken, 'idempotency-key': randomUUID() },
    payload: { branchId: scope.branchId },
  });
  expect(result.statusCode).toBe(200);
  return { ...scope, id: conversationSchema.parse(result.json()).id };
}
function join(socket: Socket, conversationId: string, branchId?: string) {
  return socket.timeout(3000).emitWithAck('conversation.join', {
    conversationId,
    ...(branchId ? { branchId } : {}),
  }) as Promise<unknown>;
}
async function message(conversationId: string) {
  const result = await f.application.inject({
    method: 'POST',
    url: '/v1/me/conversations/' + conversationId + '/messages',
    headers: { authorization: 'Bearer ' + f.customerAToken, 'idempotency-key': randomUUID() },
    payload: { body: 'Private socket test message' },
  });
  expect(result.statusCode).toBe(201);
  const row = chatMessageSchema.parse(result.json());
  return { conversationId, messageId: row.id, createdAt: row.createdAt };
}
it('COMM-001 / ACC-001: native and cookie polling participants receive source-verified IDs only; reconnect reads durable history', async () => {
  const item = await conversation(),
    customer = await connect(f.customerAToken),
    owner = await connect(f.ownerToken, true);
  expect(await join(customer, item.id)).toEqual({ joined: true });
  expect(await join(owner, item.id, item.branchId)).toEqual({ joined: true });
  const event = await message(item.id),
    received = socketEvent(owner, 'chat.message.created');
  await publisher.publish(CHAT_REALTIME_CHANNEL, JSON.stringify(event));
  expect((await received)[0]).toEqual(event);
  owner.disconnect();
  const restored = await connect(f.ownerToken, true);
  expect(await join(restored, item.id, item.branchId)).toEqual({ joined: true });
  const history = await f.application.inject({
    method: 'GET',
    url: '/v1/branches/' + item.branchId + '/conversations/' + item.id + '/messages',
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  expect(history.statusCode).toBe(200);
  expect(JSON.stringify(history.json())).toContain(event.messageId);
});
it('COMM-001 / SEC-003: foreign customer and mismatched branch joins fail closed', async () => {
  const item = await conversation(),
    stranger = await connect(f.customerBToken),
    owner = await connect(f.ownerToken);
  expect(await join(stranger, item.id)).toEqual({ joined: false });
  expect(await join(owner, item.id, randomUUID())).toEqual({ joined: false });
});
it('COMM-001 / SEC-003: suspended account is disconnected before a later persisted event is disclosed', async () => {
  const item = await conversation(),
    customer = await connect(f.customerAToken);
  expect(await join(customer, item.id)).toEqual({ joined: true });
  const event = await message(item.id),
    received: unknown[] = [];
  customer.on('chat.message.created', (value: unknown) => received.push(value));
  const disconnected = socketEvent(customer, 'disconnect');
  await f.connection.db
    .update(users)
    .set({ accountStatus: 'suspended' })
    .where(eq(users.id, f.customerA));
  await publisher.publish(CHAT_REALTIME_CHANNEL, JSON.stringify(event));
  await disconnected;
  expect(received).toEqual([]);
  await f.connection.db
    .update(users)
    .set({ accountStatus: 'active' })
    .where(eq(users.id, f.customerA));
});
it('COMM-001 / MGR-004: Manager suspension disconnects its live branch socket without another message', async () => {
  const item = await conversation(),
    managerId = randomUUID();
  await f.connection.db.insert(users).values({ id: managerId, fullName: 'Socket Manager' });
  const [assignment] = await f.connection.db
    .insert(managerAssignments)
    .values({
      userId: managerId,
      branchId: item.branchId,
      status: 'active',
      activatedAt: f.now,
      appointedByUserId: f.ownerId,
    })
    .returning();
  if (!assignment) throw new Error('Missing socket assignment');
  const token = await f.service.issue(managerId, 'mobile'),
    manager = await connect(token.accessToken);
  expect(await join(manager, item.id, item.branchId)).toEqual({ joined: true });
  const disconnected = socketEvent(manager, 'disconnect');
  await f.connection.db
    .update(managerAssignments)
    .set({ status: 'suspended' })
    .where(eq(managerAssignments.id, assignment.id));
  await disconnected;
  expect(manager.connected).toBe(false);
});
it('COMM-001 / SEC-003: logout disconnects only the revoked session while the account remains active', async () => {
  const credentials = await f.service.issue(f.ownerId, 'mobile'),
    owner = await connect(credentials.accessToken);
  const disconnected = socketEvent(owner, 'disconnect');
  const result = await f.application.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: { authorization: 'Bearer ' + credentials.accessToken },
  });
  expect(result.statusCode).toBe(200);
  await disconnected;
  expect(owner.connected).toBe(false);
  const active = await connect(f.ownerToken);
  expect(active.connected).toBe(true);
});
it('COMM-001 / ACC-006: rolled-back authority changes emit no event and retain the live socket', async () => {
  const owner = await connect(f.ownerToken),
    events: AuthorityChange[] = [],
    barrier = randomUUID();
  let complete: (() => void) | undefined;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const observer = await listenAuthorityChanges(
    f.config.DATABASE_URL,
    (event) => {
      events.push(event);
      if (event.kind === 'session' && event.id === barrier) complete?.();
    },
    () => undefined,
  );
  try {
    await expect(
      f.connection.db.transaction(async (tx) => {
        await tx.update(users).set({ accountStatus: 'suspended' }).where(eq(users.id, f.ownerId));
        throw new Error('rollback authority fixture');
      }),
    ).rejects.toThrow('rollback authority fixture');
    await f.connection.db
      .update(users)
      .set({ fullName: 'Updated owner display name' })
      .where(eq(users.id, f.ownerId));
    await f.connection.db.execute(
      sql`select pg_notify(${AUTHORITY_CHANGE_CHANNEL}, ${JSON.stringify({ kind: 'session', id: barrier })})`,
    );
    await completed;
    expect(events).toEqual([{ kind: 'session', id: barrier }]);
    expect(owner.connected).toBe(true);
  } finally {
    await observer.close();
    owner.disconnect();
  }
});
it('COMM-001 / SEC-003: branch archival immediately disconnects a staff conversation selection', async () => {
  const item = await conversation(),
    owner = await connect(f.ownerToken);
  expect(await join(owner, item.id, item.branchId)).toEqual({ joined: true });
  const disconnected = socketEvent(owner, 'disconnect');
  await f.connection.db
    .update(branches)
    .set({ archivedAt: f.now })
    .where(eq(branches.id, item.branchId));
  await disconnected;
  expect(owner.connected).toBe(false);
});
it('COMM-001 / SEC-003: lost authority listener fails closed and recovers before a new socket authenticates', async () => {
  const owner = await connect(f.ownerToken),
    disconnected = socketEvent(owner, 'disconnect');
  await f.connection.db.execute(
    sql`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'hsm-authority-listener' and datname = current_database() and pid <> pg_backend_pid()`,
  );
  await disconnected;
  expect(owner.connected).toBe(false);
  let recovered: Socket | undefined;
  await expect
    .poll(
      async () => {
        const socket = io(url, {
          path: '/v1/rt',
          transports: ['websocket'],
          auth: { token: f.ownerToken },
          reconnection: false,
          autoConnect: false,
        });
        sockets.push(socket);
        return new Promise<boolean>((resolve) => {
          socket.once('connect', () => {
            recovered = socket;
            resolve(true);
          });
          socket.once('connect_error', () => {
            socket.disconnect();
            resolve(false);
          });
          socket.connect();
        });
      },
      { timeout: 10000, interval: 1000 },
    )
    .toBe(true);
  expect(recovered?.connected).toBe(true);
});
