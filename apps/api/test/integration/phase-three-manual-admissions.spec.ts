import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants, residents, sessions, users } from '@hsm/db';
import { manualAdmissionResultSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import {
  manualAdmissionFixture,
  admitResident,
  admissionRows,
  admissionEvents,
  admissionCache,
  rejectAdmissionSource,
  restoreAdmissionSource,
} from './manual-admission.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
it('STAY-001 / RENT-003 / ACC-004: concurrent same-key HTTP creates one complete admission and private source event', async () => {
  const item = await manualAdmissionFixture(f),
    key = randomUUID();
  const responses = await Promise.all([admitResident(f, item, key), admitResident(f, item, key)]);
  expect(responses.map((row) => row.statusCode)).toEqual([201, 201]);
  const results = responses.map((row) => manualAdmissionResultSchema.parse(row.json()));
  expect(results[0]).toEqual(results[1]);
  expect(responses.map((row) => row.headers['idempotency-replayed']).sort()).toEqual([
    'false',
    'true',
  ]);
  const result = results[0];
  if (!result) throw Error('Admission result absent');
  const rows = await admissionRows(f, item.branchId);
  for (const values of [
    rows.residents,
    rows.stays,
    rows.assignments,
    rows.agreements,
    rows.history,
    rows.charges,
    rows.invoices,
    rows.ledger,
    rows.schedules,
    rows.audits,
  ])
    expect(values).toHaveLength(1);
  expect(rows.payments).toEqual([]);
  expect(rows.receipts).toEqual([]);
  expect(rows.stays[0]).toMatchObject({
    id: result.stayId,
    userId: null,
    state: 'active',
    checkedInAt: f.now,
  });
  expect(rows.residents[0]).toMatchObject({ id: result.residentId, userId: null });
  expect(rows.invoices[0]?.totalPaisa).toBe(1800001n);
  expect(rows.agreements[0]?.depositPaisa).toBe(1000001n);
  const events = await admissionEvents(f, result);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    recipientUserId: null,
    eventType: 'resident.lifecycle',
    payload: { event: 'resident.admitted', stayId: result.stayId, historyId: rows.history[0]?.id },
  });
  expect(await admissionCache(f, key)).toHaveLength(1);
});
it('ACC-004: distinct competing HTTP admissions cannot occupy one target', async () => {
  const item = await manualAdmissionFixture(f);
  const responses = await Promise.all([admitResident(f, item), admitResident(f, item)]);
  expect(responses.map((row) => row.statusCode).sort()).toEqual([201, 409]);
  const rows = await admissionRows(f, item.branchId);
  expect(rows.stays).toHaveLength(1);
  expect(rows.assignments).toHaveLength(1);
  expect(rows.residents).toHaveLength(1);
});
it('ACC-002 / CHG-010: Manager needs all three current grants and loses replay access immediately', async () => {
  const item = await manualAdmissionFixture(f),
    foreign = await manualAdmissionFixture(f),
    assignmentId = randomUUID(),
    key = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  for (const permission of ['stay_manage', 'rent_manage', 'finance_view'] as const) {
    expect((await admitResident(f, item, key, f.customerBToken)).statusCode).toBe(403);
    await f.connection.db.insert(managerInventoryGrants).values({ assignmentId, permission });
  }
  expect((await admitResident(f, item, key, f.customerBToken)).statusCode).toBe(201);
  expect((await admitResident(f, foreign, randomUUID(), f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'rent_manage'),
      ),
    );
  expect((await admitResident(f, item, key, f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'rent_manage' });
  await f.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect((await admitResident(f, item, key, f.customerBToken)).statusCode).toBe(403);
  const rows = await admissionRows(f, item.branchId);
  expect(rows.stays).toHaveLength(1);
  expect(rows.audits[0]).toMatchObject({ actorUserId: f.customerB, actorRole: 'manager' });
});
it('AUD-004 / NTF-002: required source-event failure rolls back the entire graph and idempotency cache', async () => {
  const item = await manualAdmissionFixture(f),
    key = randomUUID();
  await rejectAdmissionSource(f);
  try {
    const response = await admitResident(f, item, key);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('Fixture admission source failure');
    const rows = await admissionRows(f, item.branchId);
    for (const values of Object.values(rows)) expect(values).toEqual([]);
    expect(await admissionCache(f, key)).toEqual([]);
  } finally {
    await restoreAdmissionSource(f);
  }
  expect((await admitResident(f, item, key)).statusCode).toBe(201);
});
it('RES-003 / ACC-001: explicit linked admission retains exact identity and excludes a second active hostel', async () => {
  const first = await manualAdmissionFixture(f, f.customerA),
    second = await manualAdmissionFixture(f, f.customerA);
  expect((await admitResident(f, first)).statusCode).toBe(201);
  expect((await admitResident(f, second)).statusCode).toBe(409);
  const rows = await admissionRows(f, first.branchId);
  expect(rows.stays[0]?.userId).toBe(f.customerA);
  expect(rows.residents[0]?.id).toBe(
    first.input.manual.resident.kind === 'existing' ? first.input.manual.resident.residentId : null,
  );
  expect((await admissionRows(f, second.branchId)).stays).toEqual([]);
});
it('SEC-003: suspended linked account and foreign branch resident cannot be admitted', async () => {
  const item = await manualAdmissionFixture(f, f.customerB),
    foreign = await manualAdmissionFixture(f);
  await f.connection.db
    .update(users)
    .set({ accountStatus: 'suspended' })
    .where(eq(users.id, f.customerB));
  try {
    expect((await admitResident(f, item)).statusCode).toBe(403);
  } finally {
    await f.connection.db
      .update(users)
      .set({ accountStatus: 'active' })
      .where(eq(users.id, f.customerB));
  }
  expect(
    (
      await admitResident(f, foreign, randomUUID(), f.ownerToken, {
        ...foreign.input,
        manual: { ...foreign.input.manual, resident: item.input.manual.resident },
      })
    ).statusCode,
  ).toBe(404);
  expect((await admissionRows(f, item.branchId)).stays).toEqual([]);
  expect((await admissionRows(f, foreign.branchId)).stays).toEqual([]);
});
it('ACC-004: same key cannot alias a different initial billing intent', async () => {
  const item = await manualAdmissionFixture(f),
    key = randomUUID();
  expect((await admitResident(f, item, key)).statusCode).toBe(201);
  expect(
    (
      await admitResident(f, item, key, f.ownerToken, {
        ...item.input,
        initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 1 }],
      })
    ).statusCode,
  ).toBe(409);
  expect((await admissionRows(f, item.branchId)).stays).toHaveLength(1);
});
it('SEC-003: revoked actor session loses both fresh and replay admission access', async () => {
  const item = await manualAdmissionFixture(f),
    session = await f.service.issue(f.ownerId, 'mobile'),
    key = randomUUID();
  expect((await admitResident(f, item, key, session.accessToken)).statusCode).toBe(201);
  await f.connection.db
    .update(sessions)
    .set({ revokedAt: f.now, revokedReason: 'logout' })
    .where(eq(sessions.refreshTokenHash, f.crypto.digest(session.refreshToken, 'refresh')));
  expect((await admitResident(f, item, key, session.accessToken)).statusCode).toBe(401);
  expect((await admissionRows(f, item.branchId)).stays).toHaveLength(1);
});
it('RES-003: archived branch relationship is retained and cannot be silently revived', async () => {
  const item = await manualAdmissionFixture(f, null);
  if (item.input.manual.resident.kind !== 'existing') throw Error('Existing fixture absent');
  await f.connection.db
    .update(residents)
    .set({ archivedAt: f.now })
    .where(eq(residents.id, item.input.manual.resident.residentId));
  expect((await admitResident(f, item)).statusCode).toBe(409);
  const rows = await admissionRows(f, item.branchId);
  expect(rows.residents).toHaveLength(1);
  expect(rows.residents[0]?.archivedAt).toEqual(f.now);
  expect(rows.stays).toEqual([]);
});

it('CHG-012 / RES-003: linked Owner needs no CustomerProfile to be a resident or read the resulting own Stay', async () => {
  const item = await manualAdmissionFixture(f, f.ownerId),
    response = await admitResident(f, item);
  expect(response.statusCode).toBe(201);
  const result = manualAdmissionResultSchema.parse(response.json());
  const own = await f.application.inject({
    url: '/v1/me/stays/' + result.stayId,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  expect(own.statusCode).toBe(200);
  expect(own.json()).toMatchObject({
    id: result.stayId,
    residentId: result.residentId,
    branchId: item.branchId,
    source: 'manual',
    state: 'active',
  });
});
