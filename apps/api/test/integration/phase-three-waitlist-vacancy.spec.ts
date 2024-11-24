import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  expectedVacancies,
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
  rooms,
} from '@hsm/db';
import { expectedVacancySchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { giveNotice } from './waitlist-notice.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-24T03:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
const path = (scope: { branchId: string; roomTypeId: string }) =>
  '/v1/branches/' + scope.branchId + '/room-types/' + scope.roomTypeId + '/expected-vacancy';
function send(
  method: 'GET' | 'PUT',
  url: string,
  body?: unknown,
  token?: string,
  key = randomUUID(),
) {
  return f.application.inject({
    method,
    url,
    headers: {
      Authorization: 'Bearer ' + (token ?? f.ownerToken),
      'Idempotency-Key': key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });
}
async function fullType() {
  const scope = await f.inventory();
  await f.connection.db.update(rooms).set({ status: 'inactive' }).where(eq(rooms.id, scope.roomId));
  return scope;
}
it('WAIT-001 / CHG-040: the vacancy date comes from a resident notice and cannot be typed in', async () => {
  const scope = await fullType(),
    url = path(scope),
    key = randomUUID();
  const initial = expectedVacancySchema.parse((await send('GET', url)).json());
  expect(initial.expectedVacancyDate).toBeNull();
  await giveNotice(f, scope, '2026-12-01');
  expect(expectedVacancySchema.parse((await send('GET', url)).json()).expectedVacancyDate).toBe(
    '2026-12-01',
  );
  const typed = await send('PUT', url, {
    expectedVersion: null,
    expectedVacancyDate: '2026-11-01',
  });
  expect(typed.statusCode).toBe(409);
  const body = { expectedVersion: null, expectedVacancyDate: null };
  const cleared = await send('PUT', url, body, undefined, key);
  expect(cleared.statusCode).toBe(200);
  const row = expectedVacancySchema.parse(cleared.json());
  expect(row.expectedVacancyDate).toBe('2026-12-01');
  expect(row.version).not.toBeNull();
  const replay = await send('PUT', url, body, undefined, key);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(cleared.json());
  expect((await send('PUT', url, body)).statusCode).toBe(412);
  expect(
    await f.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.targetId, scope.roomTypeId),
          eq(hostelAuditLog.action, 'waitlist.expected_vacancy.changed'),
        ),
      ),
  ).toHaveLength(1);
});
it('WAIT-001: currently available or foreign room types cannot receive an estimate', async () => {
  const scope = await f.inventory(),
    foreign = await f.inventory();
  const body = { expectedVersion: null, expectedVacancyDate: '2026-11-01' };
  expect((await send('PUT', path(scope), body)).statusCode).toBe(409);
  expect(
    (await send('PUT', path({ ...scope, roomTypeId: foreign.roomTypeId }), body)).statusCode,
  ).toBe(404);
  expect((await send('GET', path(scope), undefined, f.customerAToken)).statusCode).toBe(403);
});
it('WAIT-001 / ACC-002: assigned Manager needs listing_edit and loses replay authority immediately on grant revocation', async () => {
  const scope = await fullType(),
    url = path(scope),
    assignmentId = randomUUID(),
    key = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: scope.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  const body = { expectedVersion: null, expectedVacancyDate: null };
  try {
    expect((await send('GET', url, undefined, f.customerBToken)).statusCode).toBe(200);
    expect((await send('PUT', url, body, f.customerBToken, key)).statusCode).toBe(403);
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'listing_edit' });
    expect((await send('PUT', url, body, f.customerBToken, key)).statusCode).toBe(200);
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(
        and(
          eq(managerInventoryGrants.assignmentId, assignmentId),
          eq(managerInventoryGrants.permission, 'listing_edit'),
        ),
      );
    expect((await send('PUT', url, body, f.customerBToken, key)).statusCode).toBe(403);
    const foreign = await fullType();
    expect((await send('GET', path(foreign), undefined, f.customerBToken)).statusCode).toBe(403);
  } finally {
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated', deactivatedAt: f.now })
      .where(eq(managerAssignments.id, assignmentId));
  }
});
it('WAIT-001 / ACC-006: actual audit failure rolls the estimate back and permits retry with its original key', async () => {
  const scope = await fullType(),
    url = path(scope),
    key = randomUUID();
  const body = { expectedVersion: null, expectedVacancyDate: null };
  await f.connection.db.execute(
    sql`create function hsm_vacancy_audit_failure() returns trigger language plpgsql as $$ begin if new.action = 'waitlist.expected_vacancy.changed' then raise exception 'fixture audit failure'; end if; return new; end $$`,
  );
  await f.connection.db.execute(
    sql`create trigger hsm_vacancy_audit_failure before insert on hostel_audit_log for each row execute function hsm_vacancy_audit_failure()`,
  );
  try {
    expect((await send('PUT', url, body, undefined, key)).statusCode).toBe(500);
    expect(
      await f.connection.db
        .select()
        .from(expectedVacancies)
        .where(eq(expectedVacancies.roomTypeId, scope.roomTypeId)),
    ).toHaveLength(0);
  } finally {
    await f.connection.db.execute(sql`drop trigger hsm_vacancy_audit_failure on hostel_audit_log`);
    await f.connection.db.execute(sql`drop function hsm_vacancy_audit_failure()`);
  }
  expect((await send('PUT', url, body, undefined, key)).statusCode).toBe(200);
});
