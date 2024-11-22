import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  supportTicketMessages,
  supportTickets,
  users,
} from '@hsm/db';
import { supportMessagePageSchema, supportTicketPageSchema } from '@hsm/contracts';
import { platformAdmin } from '../../src/admin/factory.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
let f: Awaited<ReturnType<typeof authFixture>>;
const now = new Date('2026-10-30T10:00:00Z');
const root = randomUUID(),
  staff = randomUUID(),
  participant = randomUUID(),
  foreign = randomUUID(),
  ticketId = randomUUID();
const tokens = new Map<string, string>();
const key = (prefix: number, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const messages = Array.from({ length: 302 }, (_, n) => ({
  id: key(2, n),
  ticketId,
  authorUserId: n % 4 === 0 ? staff : participant,
  body: n % 4 === 0 ? 'Internal fixture note' : 'Public fixture message',
  visibility: n % 4 === 0 ? 'internal' : 'public',
  createdAt: now,
}));
beforeAll(async () => {
  f = await authFixture(new AuthCrypto(testKeys()), now, {}, [], (db, idempotency) => ({
    platformAdmin: platformAdmin(db, idempotency, () => now),
  }));
  const db = f.connection.db;
  await db.insert(users).values(
    [root, staff, participant, foreign].map((id) => ({
      id,
      fullName: 'Disposable support fixture',
    })),
  );
  await db.insert(adminAccounts).values([
    { userId: root, isRoot: true, status: 'active' },
    { userId: staff, isRoot: false, status: 'active' },
  ]);
  await db
    .insert(adminRoleGrants)
    .values({ adminUserId: staff, role: 'support', grantedByUserId: root });
  await db.insert(supportTickets).values({
    id: ticketId,
    openedByUserId: participant,
    subject: 'Long thread',
    category: 'account',
    priority: 'high',
    status: 'open',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(supportTicketMessages).values(messages);
  await db.insert(supportTickets).values(
    Array.from({ length: 63 }, (_, n) => ({
      id: key(3, n),
      openedByUserId: participant,
      subject: n < 2 ? 'Literal %_\\ fixture' : 'Literal wildcard fixture',
      category: 'account',
      priority: 'normal' as const,
      status: 'open' as const,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })),
  );
  for (const id of [root, staff, participant, foreign])
    tokens.set(id, (await f.service.issue(id, 'mobile')).accessToken);
});
afterAll(async () => {
  await f?.close();
});
function get(user: string, url: string) {
  return f.application.inject({ url, headers: { authorization: 'Bearer ' + tokens.get(user) } });
}
async function thread(user: string, prefix: 'admin/support-tickets' | 'support/tickets') {
  const all: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 12; page++) {
    const result = await get(
      user,
      `/v1/${prefix}/${ticketId}/messages?limit=37${cursor ? '&cursor=' + cursor : ''}`,
    );
    expect(result.statusCode).toBe(200);
    const data = supportMessagePageSchema.parse(result.json());
    all.push(...data.data.map((row) => row.id));
    if (prefix === 'support/tickets') expect(data.data.every((row) => !row.internal)).toBe(true);
    cursor = data.nextCursor;
    if (!cursor) return all;
  }
  throw new Error('Support message continuation failed to terminate');
}
it('ADM-009 SEC-003: real SQL traverses beyond 200 messages while hiding every internal note from participant pages', async () => {
  const staffIds = await thread(staff, 'admin/support-tickets');
  expect(staffIds).toEqual(messages.map((row) => row.id));
  expect(new Set(staffIds).size).toBe(302);
  const ownIds = await thread(participant, 'support/tickets');
  expect(ownIds).toEqual(
    messages.filter((row) => row.visibility === 'public').map((row) => row.id),
  );
  expect(ownIds.length).toBeGreaterThan(200);
  expect((await get(foreign, `/v1/support/tickets/${ticketId}/messages`)).statusCode).toBe(404);
});
it('ADM-009: real SQL queue traverses beyond 50 tickets and searches percent/underscore/backslash literally', async () => {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 12; page++) {
    const result = await get(
      staff,
      '/v1/admin/support-tickets?limit=7' + (cursor ? '&cursor=' + cursor : ''),
    );
    expect(result.statusCode).toBe(200);
    const data = supportTicketPageSchema.parse(result.json());
    ids.push(...data.data.map((row) => row.id));
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  expect(cursor).toBeNull();
  expect(ids).toHaveLength(64);
  expect(new Set(ids).size).toBe(64);
  const result = await get(
    staff,
    '/v1/admin/support-tickets?priority=normal&q=' + encodeURIComponent('%_\\'),
  );
  expect(result.statusCode).toBe(200);
  expect(
    supportTicketPageSchema
      .parse(result.json())
      .data.map((row) => row.id)
      .sort(),
  ).toEqual([key(3, 0), key(3, 1)]);
});
it('SEC-003: support role revocation denies later pages, Root retains authority and cannot use another participant route', async () => {
  await f.connection.db
    .update(adminRoleGrants)
    .set({ revokedAt: now })
    .where(eq(adminRoleGrants.adminUserId, staff));
  expect(
    (await get(staff, `/v1/admin/support-tickets/${ticketId}/messages?cursor=${key(2, 40)}`))
      .statusCode,
  ).toBe(403);
  expect((await get(root, `/v1/admin/support-tickets/${ticketId}/messages`)).statusCode).toBe(200);
  expect((await get(root, `/v1/support/tickets/${ticketId}/messages`)).statusCode).toBe(404);
});
