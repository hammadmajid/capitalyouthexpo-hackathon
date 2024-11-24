import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { branches, inventoryClaims, roomTypes, waitlistEntries } from '@hsm/db';
import {
  publicWaitlistOpenSchema,
  staffWaitlistPageSchema,
  waitlistEntrySchema,
  waitlistPageSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { giveNotice } from './waitlist-notice.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-24T03:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
function send(
  method: 'GET' | 'POST' | 'DELETE',
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
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
it('WAIT-001 / ACC-001: competing commands return one active preference without a reservation', async () => {
  const scope = await f.inventory();
  await giveNotice(f, scope);
  const responses = await Promise.all([
    send('POST', '/me/waitlist', scopePreference(scope)),
    send('POST', '/me/waitlist', scopePreference(scope)),
  ]);
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
  const entries = responses.map((response) => waitlistEntrySchema.parse(response.json()));
  expect(entries[0]?.id).toBe(entries[1]?.id);
  expect(
    await f.connection.db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.branchId, scope.branchId)),
  ).toHaveLength(1);
  expect(
    await f.connection.db
      .select()
      .from(inventoryClaims)
      // The resident on notice holds their own bed; the waiting list must add no reservation.
      .where(
        and(eq(inventoryClaims.branchId, scope.branchId), isNull(inventoryClaims.assignmentId)),
      ),
  ).toHaveLength(0);
});
function scopePreference(scope: { branchId: string; roomTypeId: string }) {
  return { branchId: scope.branchId, roomTypeId: scope.roomTypeId };
}
it('WAIT-001 / ACC-003: same-key replay, private lists, foreign leave denial and historical rejoin', async () => {
  const scope = await f.inventory(),
    key = randomUUID();
  await giveNotice(f, scope);
  const first = await send('POST', '/me/waitlist', { branchId: scope.branchId }, undefined, key);
  expect(first.statusCode).toBe(200);
  const row = waitlistEntrySchema.parse(first.json());
  const replay = await send('POST', '/me/waitlist', { branchId: scope.branchId }, undefined, key);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(first.json());
  const other = await send('GET', '/me/waitlist', undefined, f.customerBToken);
  expect(other.statusCode).toBe(200);
  expect(waitlistPageSchema.parse(other.json()).data).toEqual([]);
  expect(
    (await send('DELETE', '/me/waitlist/' + row.id, undefined, f.customerBToken)).statusCode,
  ).toBe(404);
  const left = await send('DELETE', '/me/waitlist/' + row.id);
  expect(left.statusCode).toBe(200);
  expect(waitlistEntrySchema.parse(left.json()).leftAt).not.toBeNull();
  const rejoin = await send('POST', '/me/waitlist', { branchId: scope.branchId });
  expect(rejoin.statusCode).toBe(200);
  expect(waitlistEntrySchema.parse(rejoin.json()).id).not.toBe(row.id);
  expect(
    await f.connection.db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.branchId, scope.branchId)),
  ).toHaveLength(2);
});
it('WAIT-001 / ACC-002: staff lists are branch-scoped and never disclose private customer fields', async () => {
  const scope = await f.inventory();
  await giveNotice(f, scope);
  expect((await send('POST', '/me/waitlist', scopePreference(scope))).statusCode).toBe(200);
  expect((await send('GET', '/branches/' + scope.branchId + '/waitlist')).statusCode).toBe(403);
  const response = await send(
    'GET',
    '/branches/' + scope.branchId + '/waitlist',
    undefined,
    f.ownerToken,
  );
  expect(response.statusCode).toBe(200);
  const page = staffWaitlistPageSchema.parse(response.json());
  expect(page.data).toHaveLength(1);
  expect(page.data[0]?.customerName).toBe('Phase two fixture');
  for (const field of ['email', 'phoneE164', 'customerUserId', 'permanentAddress', 'cnicEncrypted'])
    expect(response.body).not.toContain(field);
});
it('WAIT-001: foreign or archived room types and hidden hostels cannot accept preferences', async () => {
  const scope = await f.inventory(),
    foreign = await f.inventory();
  expect(
    (
      await send('POST', '/me/waitlist', {
        branchId: scope.branchId,
        roomTypeId: foreign.roomTypeId,
      })
    ).statusCode,
  ).toBe(404);
  await f.connection.db
    .update(roomTypes)
    .set({ archivedAt: new Date() })
    .where(eq(roomTypes.id, scope.roomTypeId));
  expect((await send('POST', '/me/waitlist', scopePreference(scope))).statusCode).toBe(404);
  await f.connection.db
    .update(branches)
    .set({ listingHiddenAt: new Date() })
    .where(eq(branches.id, scope.branchId));
  expect((await send('POST', '/me/waitlist', { branchId: scope.branchId })).statusCode).toBe(404);
});
it('WAIT-001 / SEC-003: leaving remains possible after listing withdrawal and is idempotent', async () => {
  const scope = await f.inventory();
  await giveNotice(f, scope);
  const created = await send('POST', '/me/waitlist', { branchId: scope.branchId });
  const row = waitlistEntrySchema.parse(created.json()),
    key = randomUUID();
  await f.connection.db
    .update(branches)
    .set({ archivedAt: new Date() })
    .where(eq(branches.id, scope.branchId));
  const left = await send('DELETE', '/me/waitlist/' + row.id, undefined, undefined, key);
  expect(left.statusCode).toBe(200);
  expect(
    (await send('DELETE', '/me/waitlist/' + row.id, undefined, undefined, key)).json(),
  ).toEqual(left.json());
  const stored = await f.connection.db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.id, row.id), eq(waitlistEntries.customerUserId, f.customerA)));
  expect(stored[0]?.leftAt).not.toBeNull();
});
it('WAIT-001 / CHG-040: a full room with no resident on notice cannot be waited for', async () => {
  const scope = await f.inventory();
  const refused = await send('POST', '/me/waitlist', scopePreference(scope));
  expect(refused.statusCode).toBe(409);
  expect(refused.body).toContain('no resident has given notice');
  expect((await send('POST', '/me/waitlist', { branchId: scope.branchId })).statusCode).toBe(409);
  // The public signal agrees: closed before any notice, open (ids only) after one.
  const openUrl = '/v1/marketplace/' + scope.branchId + '/waitlist-open';
  const closed = await f.application.inject({ method: 'GET', url: openUrl });
  expect(closed.statusCode).toBe(200);
  expect(publicWaitlistOpenSchema.parse(closed.json())).toEqual({ open: false, roomTypeIds: [] });
  await giveNotice(f, scope, '2026-12-15');
  const opened = await f.application.inject({ method: 'GET', url: openUrl });
  expect(publicWaitlistOpenSchema.parse(opened.json())).toEqual({
    open: true,
    roomTypeIds: [scope.roomTypeId],
  });
  expect(opened.body).not.toContain('2026-12-15');
  const hidden = await f.application.inject({
    method: 'GET',
    url: '/v1/marketplace/' + randomUUID() + '/waitlist-open',
  });
  expect(hidden.statusCode).toBe(404);
  const joined = await send('POST', '/me/waitlist', scopePreference(scope));
  expect(joined.statusCode).toBe(200);
  expect(waitlistEntrySchema.parse(joined.json()).expectedVacancyDate).toBe('2026-12-15');
});
