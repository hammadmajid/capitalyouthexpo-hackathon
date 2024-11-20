import { insertAssignment, closeAssignment } from './stay-assignment.fixture.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  residents,
  stays,
  stayAssignments,
  stayAgreements,
  billingPolicies,
} from '../src/index.js';
import { inventoryHarness, type InventoryFixture } from './inventory.fixture.js';

const harness = inventoryHarness();
const database = harness.database;
beforeAll(() => harness.start());
afterAll(() => harness.close());
const startedAt = new Date('2028-02-01T06:00:00.000Z');
const transferAt = new Date('2028-02-10T06:00:00.000Z');

async function resident(scope: InventoryFixture, userId: string | null = null) {
  const id = v7();
  await database().insert(residents).values({
    id,
    branchId: scope.branchId,
    userId,
    displayName: 'Resident fixture',
    phone: '+923001234567',
    createdByUserId: scope.ownerId,
  });
  return id;
}
function stayValues(
  scope: InventoryFixture,
  residentId: string,
  patch: Partial<typeof stays.$inferInsert> = {},
) {
  return {
    branchId: scope.branchId,
    residentId,
    source: 'manual' as const,
    state: 'active' as const,
    moveInDate: '2028-02-01',
    expectedLeaveDate: '2028-03-01',
    checkedInAt: startedAt,
    createdByUserId: scope.ownerId,
    ...patch,
    id: patch.id ?? v7(),
  };
}
function assignment(
  scope: InventoryFixture,
  stayId: string,
  patch: Partial<typeof stayAssignments.$inferInsert> = {},
) {
  return {
    branchId: scope.branchId,
    stayId,
    roomTypeId: scope.roomTypeId,
    roomId: scope.roomId,
    seatId: scope.seatId,
    seatOrdinal: 1,
    startedAt,
    reason: 'Initial actual admission',
    createdByUserId: scope.ownerId,
    ...patch,
    id: patch.id ?? v7(),
  };
}

it('RES-001/003: matching contacts never merge branch-local residents or invent login users', async () => {
  const scope = await harness.scope();
  await resident(scope);
  await resident(scope);
  const rows = await database()
    .select()
    .from(residents)
    .where(eq(residents.branchId, scope.branchId));
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.userId === null)).toBe(true);
});

it('STAY-003 / ACC-004: one linked customer cannot have concurrent active stays across branches', async () => {
  const a = await harness.scope(),
    b = await harness.scope();
  const first = stayValues(a, await resident(a, a.customerA), { userId: a.customerA });
  const second = stayValues(b, await resident(b, a.customerA), { userId: a.customerA });
  const results = await Promise.allSettled([
    database().insert(stays).values(first),
    database().insert(stays).values(second),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
});

it('RES-001 / ACC-004: resident and linked account cannot be substituted across branches', async () => {
  const a = await harness.scope(),
    b = await harness.scope();
  const id = await resident(a, a.customerA);
  await expect(database().insert(stays).values(stayValues(b, id))).rejects.toThrow();
  await expect(
    database()
      .insert(stays)
      .values(stayValues(a, id, { userId: null })),
  ).rejects.toThrow();
  await expect(
    database()
      .insert(stays)
      .values(stayValues(a, id, { userId: a.customerB })),
  ).rejects.toThrow();
});

it.each([
  { source: 'booking' as const },
  { expectedLeaveDate: '2028-02-01' },
  { version: 0 },
  { checkedInAt: null },
  { state: 'completed' as const },
  { closedAt: transferAt },
])('STAY-001/004: invalid lifecycle/source/date row %j cannot commit', async (patch) => {
  const scope = await harness.scope();
  await expect(
    database()
      .insert(stays)
      .values(stayValues(scope, await resident(scope), patch)),
  ).rejects.toThrow();
});

it('RES-004 / ACC-004: assignment foreign keys preserve exact branch/type/room/bed lineage', async () => {
  const a = await harness.scope(),
    b = await harness.scope();
  const stay = stayValues(a, await resident(a));
  await database().insert(stays).values(stay);
  for (const patch of [
    { roomTypeId: b.roomTypeId },
    { roomId: b.roomId },
    { seatId: b.seatId },
    { seatOrdinal: 2 },
    { seatId: null },
  ]) {
    await expect(insertAssignment(database(), assignment(a, stay.id, patch))).rejects.toThrow();
  }
});

it.each(['bed', 'room'] as const)(
  'RES-004 / ACC-001: concurrent %s occupancy and inverse target cannot overlap',
  async (first) => {
    const scope = await harness.scope();
    const a = stayValues(scope, await resident(scope)),
      b = stayValues(scope, await resident(scope));
    await database().insert(stays).values([a, b]);
    const whole = { seatId: null, seatOrdinal: null };
    const results = await Promise.allSettled([
      insertAssignment(database(), assignment(scope, a.id, first === 'room' ? whole : {})),
      insertAssignment(database(), assignment(scope, b.id, first === 'bed' ? whole : {})),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  },
);

it('RES-005: historical intervals cannot overlap and adjacent transfer preserves both rows', async () => {
  const scope = await harness.scope();
  const stay = stayValues(scope, await resident(scope));
  await database().insert(stays).values(stay);
  const original = assignment(scope, stay.id);
  await insertAssignment(database(), original);
  await closeAssignment(database(), original.id, transferAt);
  await expect(
    insertAssignment(
      database(),
      assignment(scope, stay.id, { seatId: scope.otherSeatId, seatOrdinal: 2 }),
    ),
  ).rejects.toThrow();
  await insertAssignment(
    database(),
    assignment(scope, stay.id, {
      seatId: scope.otherSeatId,
      seatOrdinal: 2,
      startedAt: transferAt,
    }),
  );
  const history = await database()
    .select()
    .from(stayAssignments)
    .where(eq(stayAssignments.stayId, stay.id));
  expect(history).toHaveLength(2);
  expect(history.filter((row) => row.endedAt === null)).toHaveLength(1);
  await expect(
    database()
      .update(stayAssignments)
      .set({ endedAt: null })
      .where(eq(stayAssignments.id, original.id)),
  ).rejects.toThrow();
  await expect(
    database().delete(stayAssignments).where(eq(stayAssignments.id, original.id)),
  ).rejects.toThrow();
});

it('STAY-004: terminal state cannot be reactivated and version must advance for changes', async () => {
  const scope = await harness.scope();
  const stay = stayValues(scope, await resident(scope));
  await database().insert(stays).values(stay);
  await expect(
    database().update(stays).set({ expectedLeaveDate: '2028-04-01' }).where(eq(stays.id, stay.id)),
  ).rejects.toThrow();
  await database()
    .update(stays)
    .set({ state: 'completed', closedAt: transferAt, version: 2 })
    .where(eq(stays.id, stay.id));
  await expect(
    database()
      .update(stays)
      .set({ state: 'active', closedAt: null, version: 3 })
      .where(eq(stays.id, stay.id)),
  ).rejects.toThrow();
  await expect(database().delete(stays).where(eq(stays.id, stay.id))).rejects.toThrow();
});

it('RENT-003: agreements and policies preserve exact integer paisa and immutable history', async () => {
  const scope = await harness.scope();
  const stay = stayValues(scope, await resident(scope));
  await database().insert(stays).values(stay);
  const policy = {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 15,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: false,
    customCharges: 'disabled',
  };
  const policyId = v7(),
    agreementId = v7();
  await database().insert(billingPolicies).values({
    id: policyId,
    branchId: scope.branchId,
    policy,
    isCurrent: true,
    createdByUserId: scope.ownerId,
  });
  await database()
    .insert(stayAgreements)
    .values({
      id: agreementId,
      branchId: scope.branchId,
      stayId: stay.id,
      version: 1,
      effectiveFrom: '2028-02-01',
      policyVersionId: policyId,
      rentAmountPaisa: 1800001n,
      depositPaisa: 1000001n,
      termsSnapshot: {
        policyVersionId: policyId,
        currency: 'PKR',
        fees: [],
        catalog: [],
        rentAmountPaisa: 1800001,
        depositPaisa: 1000001,
        policy,
      },
      reason: 'Agreed admission terms',
      createdByUserId: scope.ownerId,
    });
  const rows = await database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, agreementId));
  expect(rows[0]?.rentAmountPaisa).toBe(1800001n);
  await expect(
    database()
      .update(stayAgreements)
      .set({ rentAmountPaisa: 1n })
      .where(eq(stayAgreements.id, agreementId)),
  ).rejects.toThrow();
  await expect(
    database().delete(stayAgreements).where(eq(stayAgreements.id, agreementId)),
  ).rejects.toThrow();
  await expect(
    database()
      .update(billingPolicies)
      .set({ policy: { fixture: false } })
      .where(eq(billingPolicies.id, policyId)),
  ).rejects.toThrow();
  await database()
    .update(billingPolicies)
    .set({ isCurrent: false })
    .where(eq(billingPolicies.id, policyId));
  await expect(
    database()
      .update(billingPolicies)
      .set({ isCurrent: true })
      .where(eq(billingPolicies.id, policyId)),
  ).rejects.toThrow();
});

it('STAY-003 / RES-003: explicit identity linkage must commit with the active stay, never bypass global uniqueness', async () => {
  const scope = await harness.scope();
  const residentId = await resident(scope),
    stay = stayValues(scope, residentId);
  await database().insert(stays).values(stay);
  await expect(
    database()
      .update(residents)
      .set({ userId: scope.customerA })
      .where(eq(residents.id, residentId)),
  ).rejects.toThrow();
  await database().transaction(async (transaction) => {
    await transaction
      .update(residents)
      .set({ userId: scope.customerA })
      .where(eq(residents.id, residentId));
    await transaction
      .update(stays)
      .set({ userId: scope.customerA, version: 2 })
      .where(eq(stays.id, stay.id));
  });
  const [row] = await database().select().from(stays).where(eq(stays.id, stay.id));
  expect(row?.userId).toBe(scope.customerA);
});
