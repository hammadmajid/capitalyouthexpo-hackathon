import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  chatMessages,
  conversations,
  files,
  hostelAuditLog,
  managerAssignments,
  notificationOutbox,
  sensitiveAccessLog,
} from '@hsm/db';
import {
  chatMessagePageSchema,
  chatMessageSchema,
  conversationPageSchema,
  conversationSchema,
  downloadResponseSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-24T03:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
function send(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  token?: string,
  key = randomUUID(),
) {
  return f.application.inject({
    method,
    url: '/v1' + path,
    headers: {
      Authorization: 'Bearer ' + (token ?? f.customerAToken),
      'Idempotency-Key': key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });
}
async function prepare() {
  const scope = await f.inventory();
  const response = await send('POST', '/me/conversations', { branchId: scope.branchId });
  expect(response.statusCode).toBe(200);
  return { ...scope, conversation: conversationSchema.parse(response.json()) };
}
const own = (id: string) => '/me/conversations/' + id;
const branch = (branchId: string, id: string) => '/branches/' + branchId + '/conversations/' + id;
it('COMM-001: concurrent thread creation returns one customer/branch conversation', async () => {
  const scope = await f.inventory();
  const responses = await Promise.all(
    [1, 2, 3].map(() => send('POST', '/me/conversations', { branchId: scope.branchId })),
  );
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
  const ids = responses.map((response) => conversationSchema.parse(response.json()).id);
  expect(new Set(ids).size).toBe(1);
  expect(
    await f.connection.db
      .select()
      .from(conversations)
      .where(eq(conversations.branchId, scope.branchId)),
  ).toHaveLength(1);
});
it('COMM-001 / ACC-006: same-key sends persist one message, source event and staff audit; pagination and read markers are authoritative', async () => {
  const item = await prepare(),
    id = item.conversation.id,
    key = randomUUID();
  const results = await Promise.all([
    send('POST', own(id) + '/messages', { body: 'Hello hostel' }, undefined, key),
    send('POST', own(id) + '/messages', { body: 'Hello hostel' }, undefined, key),
  ]);
  expect(results.map((response) => response.statusCode)).toEqual([201, 201]);
  expect(results[0]?.json()).toEqual(results[1]?.json());
  const first = chatMessageSchema.parse(results[0]?.json());
  const reply = await send(
    'POST',
    branch(item.branchId, id) + '/messages',
    { body: 'Welcome customer' },
    f.ownerToken,
  );
  expect(reply.statusCode).toBe(201);
  const second = chatMessageSchema.parse(reply.json());
  expect(second.senderSide).toBe('branch');
  expect(second.senderUserId).toBe(f.ownerId);
  expect(
    await f.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(eq(hostelAuditLog.action, 'chat.message.sent'), eq(hostelAuditLog.targetId, second.id)),
      ),
  ).toHaveLength(1);
  const page = await send('GET', own(id) + '/messages?limit=1');
  expect(page.statusCode).toBe(200);
  const parsed = chatMessagePageSchema.parse(page.json());
  expect(parsed.data[0]?.id).toBe(second.id);
  expect(parsed.nextCursor).toBe(second.id);
  const next = await send('GET', own(id) + '/messages?cursor=' + second.id);
  expect(chatMessagePageSchema.parse(next.json()).data.map((message) => message.id)).toEqual([
    first.id,
  ]);
  const unread = await send('GET', '/me/conversations');
  expect(
    conversationPageSchema.parse(unread.json()).data.find((row) => row.id === id)?.unreadCount,
  ).toBe(1);
  expect((await send('POST', own(id) + '/read')).statusCode).toBe(200);
  expect(
    conversationPageSchema
      .parse((await send('GET', '/me/conversations')).json())
      .data.find((row) => row.id === id)?.unreadCount,
  ).toBe(0);
  expect(
    (
      await send(
        'POST',
        branch(item.branchId, id) + '/messages',
        { body: 'After the read marker' },
        f.ownerToken,
      )
    ).statusCode,
  ).toBe(201);
  expect(
    conversationPageSchema
      .parse((await send('GET', '/me/conversations')).json())
      .data.find((row) => row.id === id)?.unreadCount,
  ).toBe(1);
  expect(
    await f.connection.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, 'chat.message:' + first.id)),
  ).toHaveLength(1);
});
it('COMM-001 / COMM-002 / SEC-003: foreign customers and unrelated branches cannot enumerate or access private messages', async () => {
  const item = await prepare(),
    id = item.conversation.id,
    other = await f.inventory();
  expect((await send('GET', own(id) + '/messages', undefined, f.customerBToken)).statusCode).toBe(
    404,
  );
  expect(
    (await send('POST', own(id) + '/messages', { body: 'Injected' }, f.customerBToken)).statusCode,
  ).toBe(404);
  expect(
    (await send('GET', branch(other.branchId, id) + '/messages', undefined, f.ownerToken))
      .statusCode,
  ).toBe(404);
  expect(
    (
      await send(
        'GET',
        '/branches/' + item.branchId + '/conversations',
        undefined,
        f.customerAToken,
      )
    ).statusCode,
  ).toBe(403);
  expect(
    conversationPageSchema.parse(
      (await send('GET', '/me/conversations', undefined, f.customerBToken)).json(),
    ).data,
  ).toHaveLength(0);
});
it('COMM-001 / ACC-002: a suspended Manager loses both history and same-key replay authority', async () => {
  const item = await prepare(),
    assignmentId = randomUUID(),
    key = randomUUID(),
    url = branch(item.branchId, item.conversation.id) + '/messages';
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    appointedByUserId: f.ownerId,
    status: 'active',
    activatedAt: f.now,
  });
  try {
    expect(
      (await send('POST', url, { body: 'Manager reply' }, f.customerBToken, key)).statusCode,
    ).toBe(201);
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'suspended', suspendedAt: f.now })
      .where(eq(managerAssignments.id, assignmentId));
    expect(
      (await send('POST', url, { body: 'Manager reply' }, f.customerBToken, key)).statusCode,
    ).toBe(403);
    expect((await send('GET', url, undefined, f.customerBToken)).statusCode).toBe(403);
  } finally {
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated', deactivatedAt: f.now })
      .where(eq(managerAssignments.id, assignmentId));
  }
});
async function attachment(scanStatus: 'clean' | 'pending', uploadedBy = f.customerA) {
  const id = randomUUID();
  await f.connection.db.insert(files).values({
    id,
    uploadedBy,
    purpose: 'chat_attachment',
    visibility: 'private',
    bucket: f.storage.bucket,
    objectKey: 'private/chat_attachment/' + id + '/' + randomUUID(),
    mimeType: 'application/pdf',
    sizeBytes: 128n,
    scanStatus,
    sha256: scanStatus === 'clean' ? randomBytes(32) : null,
  });
  return id;
}
it('COMM-001 / SEC-003: own clean attachment is participant-only; pending/foreign/reused attachments roll back the message', async () => {
  const item = await prepare(),
    id = item.conversation.id,
    fileId = await attachment('clean');
  const response = await send('POST', own(id) + '/messages', { attachmentFileIds: [fileId] });
  expect(response.statusCode).toBe(201);
  expect(chatMessageSchema.parse(response.json()).attachmentFileIds).toEqual([fileId]);
  const download = await send(
    'GET',
    branch(item.branchId, id) + '/attachments/' + fileId + '/download',
    undefined,
    f.ownerToken,
  );
  expect(download.statusCode).toBe(200);
  expect(downloadResponseSchema.parse(download.json()).url).toContain('X-Amz-Signature');
  expect(
    await f.connection.db
      .select()
      .from(sensitiveAccessLog)
      .where(eq(sensitiveAccessLog.resourceId, fileId)),
  ).toHaveLength(1);
  expect(
    (
      await send(
        'GET',
        own(id) + '/attachments/' + fileId + '/download',
        undefined,
        f.customerBToken,
      )
    ).statusCode,
  ).toBe(404);
  const pending = await attachment('pending'),
    foreign = await attachment('clean', f.customerB);
  for (const file of [pending, foreign])
    expect(
      (
        await send('POST', own(id) + '/messages', {
          body: 'Must roll back',
          attachmentFileIds: [file],
        })
      ).statusCode,
    ).toBe(404);
  expect(
    (await send('POST', own(id) + '/messages', { attachmentFileIds: [fileId] })).statusCode,
  ).toBe(409);
  expect(
    await f.connection.db.select().from(chatMessages).where(eq(chatMessages.conversationId, id)),
  ).toHaveLength(1);
  await f.connection.db
    .update(files)
    .set({ scanStatus: 'rejected', sha256: null })
    .where(eq(files.id, fileId));
  expect((await send('GET', own(id) + '/attachments/' + fileId + '/download')).statusCode).toBe(
    404,
  );
});
it('COMM-001 / ACC-006: mandatory event failure rolls message and acknowledgement back for original-key retry', async () => {
  const item = await prepare(),
    key = randomUUID(),
    url = own(item.conversation.id) + '/messages';
  await f.connection.db.execute(
    sql`create function hsm_chat_outbox_failure() returns trigger language plpgsql as $$ begin if new.event_type = 'chat.lifecycle' then raise exception 'fixture chat event failure'; end if; return new; end $$`,
  );
  await f.connection.db.execute(
    sql`create trigger hsm_chat_outbox_failure before insert on notification_outbox for each row execute function hsm_chat_outbox_failure()`,
  );
  try {
    expect((await send('POST', url, { body: 'Original command' }, undefined, key)).statusCode).toBe(
      500,
    );
    expect(
      await f.connection.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, item.conversation.id)),
    ).toHaveLength(0);
  } finally {
    await f.connection.db.execute(sql`drop trigger hsm_chat_outbox_failure on notification_outbox`);
    await f.connection.db.execute(sql`drop function hsm_chat_outbox_failure()`);
  }
  expect((await send('POST', url, { body: 'Original command' }, undefined, key)).statusCode).toBe(
    201,
  );
});

it('COMM-001 / NTF-002: real chat events fan out only to current recipients without message text and acknowledge once', async () => {
  const item = await prepare(),
    db = f.connection.db;
  const response = await send('POST', own(item.conversation.id) + '/messages', {
    body: 'Private message body must not enter notices',
  });
  expect(response.statusCode).toBe(201);
  const message = chatMessageSchema.parse(response.json());
  const [source] = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'chat.message:' + message.id));
  if (!source) throw new Error('Chat source absent');
  const leaseToken = randomUUID(),
    leaseExpiresAt = new Date(f.now.getTime() + 60000);
  await db
    .update(notificationOutbox)
    .set({ leaseToken, leaseExpiresAt })
    .where(eq(notificationOutbox.id, source.id));
  const service = new NotificationService(new NotificationRepository(db, () => f.now), () => f.now);
  await service.deliver({ ...source, leaseToken, leaseExpiresAt });
  await service.deliver({ ...source, leaseToken, leaseExpiresAt });
  const targets = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'notification.create'),
        sql`${notificationOutbox.payload}->>'operationId' = ${message.id}`,
      ),
    );
  expect(targets).toHaveLength(1);
  expect(targets[0]?.recipientUserId).toBe(f.ownerId);
  expect(JSON.stringify(targets[0]?.payload)).not.toContain(message.body);
});
