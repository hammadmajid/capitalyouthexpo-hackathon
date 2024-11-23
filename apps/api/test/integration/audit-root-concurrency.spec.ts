import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminAccounts, users, platformAuditLog } from '@hsm/db';
import { platformAdmin } from '../../src/admin/factory.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
let f: Awaited<ReturnType<typeof authFixture>>;
const now = new Date('2026-10-28T10:00:00Z');
const ids = Array.from({ length: 5 }, () => randomUUID());
const headers: Record<string, string> = {};
beforeAll(async () => {
  f = await authFixture(new AuthCrypto(testKeys()), now, {}, [], (db, idempotency) => ({
    platformAdmin: platformAdmin(db, idempotency, () => now),
  }));
  await f.connection.db
    .insert(users)
    .values(ids.map((id) => ({ id, fullName: 'Root concurrency fixture' })));
  // Two active Roots leave one cap slot; all identities are disposable.
  await f.connection.db
    .insert(adminAccounts)
    .values(ids.map((id, index) => ({ userId: id, isRoot: index < 2, status: 'active' as const })));
  for (const id of ids.slice(0, 2))
    headers[id] = 'Bearer ' + (await f.service.issue(id, 'mobile')).accessToken;
});
afterAll(async () => {
  await f?.close();
});
function change(actor: string, target: string, isRoot: boolean) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/admin/admins/${target}/changes`,
    headers: { authorization: headers[actor] ?? '', 'Idempotency-Key': randomUUID() },
    payload: { change: 'root', isRoot, reason: 'Concurrency acceptance' },
  });
}
async function roots() {
  return f.connection.db
    .select()
    .from(adminAccounts)
    .where(and(eq(adminAccounts.isRoot, true), eq(adminAccounts.status, 'active')));
}
it('AUD-015 / ADM-001 / ACC-004: distinct Roots racing promotions cannot exceed the three-Root cap', async () => {
  const [a, b, c, d] = ids;
  if (!a || !b || !c || !d) throw new Error('Missing Root fixture');
  const responses = await Promise.all([change(a, c, true), change(b, d, true)]);
  expect(responses.map((row) => row.statusCode).sort()).toEqual([200, 409]);
  expect(await roots()).toHaveLength(3);
  const audit = await f.connection.db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.action, 'admin.root'));
  expect(audit).toHaveLength(1);
  const promoted = responses[0]?.statusCode === 200 ? c : d;
  expect((await change(a, promoted, false)).statusCode).toBe(200);
});
it('AUD-015 / ADM-001 / SEC-003: concurrent self-demotions retain one live Root and deny the revoked actor', async () => {
  const [a, b] = ids;
  if (!a || !b) throw new Error('Missing Root fixture');
  const responses = await Promise.all([change(a, a, false), change(b, b, false)]);
  expect(responses.map((row) => row.statusCode).sort()).toEqual([200, 409]);
  const remaining = await roots();
  expect(remaining).toHaveLength(1);
  const revoked = remaining[0]?.userId === a ? b : a;
  expect(
    (
      await f.application.inject({
        url: '/v1/admin/admins',
        headers: { authorization: headers[revoked] ?? '' },
      })
    ).statusCode,
  ).toBe(403);
});
it('AUD-015 / ADM-001 / ACC-004: Roots concurrently demoting each other serialize before authority locks', async () => {
  const [a, b] = ids;
  if (!a || !b) throw new Error('Missing Root fixture');
  const [remaining] = await roots();
  if (!remaining) throw new Error('Missing live Root');
  const revoked = remaining.userId === a ? b : a;
  expect((await change(remaining.userId, revoked, true)).statusCode).toBe(200);
  const responses = await Promise.all([change(a, b, false), change(b, a, false)]);
  expect(responses.map((row) => row.statusCode).sort()).toEqual([200, 403]);
  expect(await roots()).toHaveLength(1);
});
