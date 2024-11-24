import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  adminRoleGrants,
  chatMessages,
  hostelAuditLog,
  managerAssignments,
  platformAuditLog,
  reports,
  sensitiveAccessLog,
} from '@hsm/db';
import { chatReportSchema, chatSafetyContextSchema } from '@hsm/contracts';
import { chatReportFixture } from './chat-report.fixture.js';
let f: Awaited<ReturnType<typeof chatReportFixture>>;
beforeAll(async () => {
  f = await chatReportFixture();
});
afterAll(async () => {
  await f?.close();
});
function request(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  actor = 'customer',
  key = randomUUID(),
) {
  return f.application.inject({
    method,
    url: '/v1' + path,
    headers: { authorization: 'Bearer ' + f.tokens[actor], 'idempotency-key': key },
    ...(body
      ? {
          payload: JSON.stringify(body),
          headers: {
            authorization: 'Bearer ' + f.tokens[actor],
            'idempotency-key': key,
            'content-type': 'application/json',
          },
        }
      : {}),
  });
}
const reportInput = (targetId: string) => ({
  targetType: 'chat_message',
  targetId,
  reason: 'harassment',
  details: 'Please investigate this specific incident.',
});
async function reported() {
  const source = await f.source(),
    result = await request('POST', '/me/reports', reportInput(source.target.id));
  expect(result.statusCode).toBe(201);
  return { ...source, report: chatReportSchema.parse(result.json()) };
}
it('COMM-002 / ACC-006: concurrent report retries create one source-bound case', async () => {
  const item = await f.source(),
    key = randomUUID(),
    body = reportInput(item.target.id);
  const result = await Promise.all(
    [1, 2, 3].map(() => request('POST', '/me/reports', body, 'customer', key)),
  );
  expect(result.map((row) => row.statusCode)).toEqual([201, 201, 201]);
  expect(result[0]?.json()).toEqual(result[1]?.json());
  const report = chatReportSchema.parse(result[0]?.json());
  expect(report).toMatchObject({
    reporterUserId: f.ids.customer,
    targetId: item.target.id,
    status: 'open',
  });
  expect(
    await f.connection.db.select().from(reports).where(eq(reports.targetId, item.target.id)),
  ).toHaveLength(1);
});
it('COMM-002 / SEC-003: foreign customer, guessed message and mismatched branch/thread reports fail closed', async () => {
  const item = await f.source(),
    input = reportInput(item.target.id);
  expect((await request('POST', '/me/reports', input, 'stranger')).statusCode).toBe(404);
  expect((await request('POST', '/me/reports', reportInput(randomUUID()))).statusCode).toBe(404);
  expect(
    (
      await request(
        'POST',
        '/branches/' + item.otherBranchId + '/conversations/' + item.conversationId + '/reports',
        input,
        'owner',
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await request(
        'POST',
        '/branches/' + item.branchId + '/conversations/' + item.foreignConversationId + '/reports',
        input,
        'owner',
      )
    ).statusCode,
  ).toBe(404);
  expect(
    await f.connection.db.select().from(reports).where(eq(reports.targetId, item.target.id)),
  ).toHaveLength(0);
});
it('COMM-002 / SEC-003 / AUD-002: staff reports are scoped and audited; revoked Managers cannot replay', async () => {
  const item = await f.source(),
    input = reportInput(item.target.id),
    path = '/branches/' + item.branchId + '/conversations/' + item.conversationId + '/reports',
    key = randomUUID();
  const result = await request('POST', path, input, 'manager', key);
  expect(result.statusCode).toBe(201);
  const report = chatReportSchema.parse(result.json());
  expect(
    await f.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.action, 'chat.message.reported'),
          eq(hostelAuditLog.targetId, report.id),
        ),
      ),
  ).toHaveLength(1);
  await f.connection.db
    .update(managerAssignments)
    .set({ status: 'suspended' })
    .where(eq(managerAssignments.id, item.assignmentId));
  expect((await request('POST', path, input, 'manager', key)).statusCode).toBe(403);
});
it('COMM-002: authorized safety access is a bounded reported-message window and is audited on every read', async () => {
  const item = await reported(),
    path = '/admin/reports/' + item.report.id + '/chat-context';
  for (const actor of ['support', 'moderator', 'root']) {
    const result = await request(
      'POST',
      path,
      { justification: 'Review the reported harassment evidence.' },
      actor,
    );
    expect(result.statusCode).toBe(200);
    const context = chatSafetyContextSchema.parse(result.json());
    expect(context.messages.map((row) => row.id)).toEqual(
      item.messages.slice(2, 7).map((row) => row.id),
    );
    expect(JSON.stringify(context)).not.toContain('PRIVATE CASE MESSAGE 0');
    expect(JSON.stringify(context)).not.toContain('senderUserId');
    expect(JSON.stringify(context)).not.toContain('attachmentFileIds');
  }
  expect(
    await f.connection.db
      .select()
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.targetId, item.report.id),
          eq(platformAuditLog.action, 'access_private_chat'),
        ),
      ),
  ).toHaveLength(3);
  expect(
    await f.connection.db
      .select()
      .from(sensitiveAccessLog)
      .where(eq(sensitiveAccessLog.resourceId, item.report.id)),
  ).toHaveLength(6);
  const queue = await request(
    'GET',
    '/admin/reports?' +
      new URLSearchParams({ status: 'open', targetType: 'chat_message', limit: '100' }).toString(),
    undefined,
    'support',
  );
  expect(queue.statusCode).toBe(200);
  expect(JSON.stringify(queue.json())).not.toContain('PRIVATE CASE MESSAGE');
});
it('COMM-002 / SEC-003: ordinary private chat remains denied to admins, and case reads require the exact source and justification', async () => {
  const item = await reported(),
    path = '/admin/reports/' + item.report.id + '/chat-context';
  for (const actor of ['root', 'support']) {
    expect(
      (
        await request(
          'GET',
          '/me/conversations/' + item.conversationId + '/messages',
          undefined,
          actor,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'GET',
          '/branches/' + item.branchId + '/conversations/' + item.conversationId + '/messages',
          undefined,
          actor,
        )
      ).statusCode,
    ).toBe(403);
  }
  for (const actor of ['customer', 'owner', 'verification'])
    expect(
      (await request('POST', path, { justification: 'Investigate the report.' }, actor)).statusCode,
    ).toBe(403);
  expect((await request('POST', path, {}, 'support')).statusCode).toBe(400);
  expect(
    (
      await request(
        'POST',
        path,
        { justification: 'Review', conversationId: item.foreignConversationId },
        'support',
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await request(
        'POST',
        '/admin/reports/' + randomUUID() + '/chat-context',
        { justification: 'Review a case' },
        'support',
      )
    ).statusCode,
  ).toBe(404);
});
it('COMM-002: removed neighbors never expand the window; retained reported evidence remains case-only', async () => {
  const item = await reported(),
    neighbor = item.messages[3];
  if (!neighbor) throw new Error('Missing neighbor');
  await f.connection.db
    .update(chatMessages)
    .set({ deletedAt: f.now })
    .where(eq(chatMessages.id, neighbor.id));
  await f.connection.db
    .update(chatMessages)
    .set({ deletedAt: f.now })
    .where(eq(chatMessages.id, item.target.id));
  const result = await request(
    'POST',
    '/admin/reports/' + item.report.id + '/chat-context',
    { justification: 'Review retained reported evidence.' },
    'support',
  );
  expect(result.statusCode).toBe(200);
  const context = chatSafetyContextSchema.parse(result.json());
  expect(context.messages).toHaveLength(4);
  expect(context.messages.find((row) => row.id === item.target.id)?.removed).toBe(true);
  expect(context.messages.some((row) => row.id === item.messages[1]?.id)).toBe(false);
  expect((await request('POST', '/me/reports', reportInput(item.target.id))).statusCode).toBe(404);
});
it('COMM-002 / AUD-002: failed sensitive-access audit rolls back the case read and platform audit', async () => {
  const item = await reported();
  await f.connection.db.execute(
    sql`CREATE FUNCTION reject_case_access_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture audit unavailable'; END; $$`,
  );
  await f.connection.db.execute(
    sql`CREATE TRIGGER reject_case_access_fixture BEFORE INSERT ON sensitive_access_log FOR EACH STATEMENT EXECUTE FUNCTION reject_case_access_fixture()`,
  );
  try {
    const result = await request(
      'POST',
      '/admin/reports/' + item.report.id + '/chat-context',
      { justification: 'Review this case' },
      'support',
    );
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain('PRIVATE CASE MESSAGE');
    expect(result.body).not.toContain('Fixture audit unavailable');
    expect(
      await f.connection.db
        .select()
        .from(platformAuditLog)
        .where(eq(platformAuditLog.targetId, item.report.id)),
    ).toHaveLength(0);
  } finally {
    await f.connection.db.execute(
      sql`DROP TRIGGER reject_case_access_fixture ON sensitive_access_log`,
    );
    await f.connection.db.execute(sql`DROP FUNCTION reject_case_access_fixture()`);
  }
});
it('COMM-002 / SEC-003: revoking an admin role denies both queue and case access immediately', async () => {
  const item = await reported();
  await f.connection.db
    .update(adminRoleGrants)
    .set({ revokedAt: f.now })
    .where(
      and(eq(adminRoleGrants.adminUserId, f.ids.support), eq(adminRoleGrants.role, 'support')),
    );
  expect((await request('GET', '/admin/reports', undefined, 'support')).statusCode).toBe(403);
  expect(
    (
      await request(
        'POST',
        '/admin/reports/' + item.report.id + '/chat-context',
        { justification: 'Review this case' },
        'support',
      )
    ).statusCode,
  ).toBe(403);
});
