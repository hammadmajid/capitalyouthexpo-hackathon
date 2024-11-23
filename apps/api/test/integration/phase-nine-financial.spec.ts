import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants, stayAgreements } from '@hsm/db';
import { stayFinalStatementResponseSchema, staySettlementSchema } from '@hsm/contracts';
import { dailyProration, fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';
const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());
async function checkout(base: string, stayId: string, applyAvailableDeposit = false) {
  return h.ok(base + '/checkout', {
    expectedVersion: await h.version(stayId),
    reason: 'Moved out',
    applyAvailableDeposit,
  });
}
it('P9-FIX-03 / OUT-003/004: checkout applies held deposit atomically, once, within its grants', async () => {
  const { stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  await h.ok(`${base}/payments`, {
    amountPaisa: 50000,
    method: 'cash',
    paidOn: '2026-06-25',
    note: 'Deposit received in cash',
    allocations: [],
    depositPaisa: 50000,
    advanceCreditPaisa: 0,
  });
  const done = await checkout(base, stay.stayId, true);
  expect(done.depositApplied).toEqual([expect.objectContaining({ amountPaisa: 50000 })]);
  const statement = staySettlementSchema.parse(done.statement);
  expect(statement).toMatchObject({
    outstandingPaisa: rent - 50000,
    deposit: { appliedToRentPaisa: 50000, heldPaisa: 0 },
  });
  const again = await h.send(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Again',
    applyAvailableDeposit: true,
  });
  expect(again.statusCode).toBe(409);
});
it('P9-FIX-04 / OUT-005: refunds after checkout appear beside the unchanged frozen statement', async () => {
  const { stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const [invoice] = await h.invoices(stay.stayId);
  const payment = await h.ok(`${base}/payments`, {
    amountPaisa: rent + 50000,
    method: 'cash',
    paidOn: '2026-06-25',
    note: 'Rent and deposit in cash',
    allocations: [{ invoiceId: invoice?.id, amountPaisa: rent }],
    depositPaisa: 50000,
    advanceCreditPaisa: 0,
  });
  await checkout(base, stay.stayId);
  const read = async () => {
    const response = await h.get(
      `/v1/me/stays/${stay.stayId}/final-statement`,
      h.fixture().customerAToken,
    );
    expect(response.statusCode, response.body).toBe(200);
    return stayFinalStatementResponseSchema.parse(response.json());
  };
  const before = await read();
  expect(before.afterCheckout).toMatchObject({
    movements: [],
    current: { netRefundablePaisa: 50000 },
  });
  const refund = (amountPaisa: number) =>
    h.send(`${base}/fund-movements`, {
      paymentId: payment.paymentId,
      movement: {
        kind: 'deposit_refund',
        amountPaisa,
        reason: 'Deposit refund',
        externalReference: 'BANK-7',
      },
    });
  const raced = await Promise.all([refund(30000), refund(30000)]);
  expect(raced.map((row) => row.statusCode).sort()).toEqual([200, 409]);
  expect((await refund(40000)).statusCode).toBe(409);
  const after = await read();
  expect(after.statement).toEqual(before.statement);
  expect(after.afterCheckout.movements).toEqual([
    expect.objectContaining({
      kind: 'deposit_refund',
      amountPaisa: 30000,
      externalReference: 'BANK-7',
    }),
  ]);
  expect(after.afterCheckout.current).toMatchObject({
    deposit: { refundedPaisa: 30000, heldPaisa: 20000 },
    netRefundablePaisa: 20000,
  });
  expect(
    (await h.get(`/v1/me/stays/${stay.stayId}/final-statement`, h.fixture().customerBToken))
      .statusCode,
  ).toBe(404);
});
it('P9-FIX-01/02/03 / CHG-010: money-changing lifecycle acts need the matching finance grants', async () => {
  const { item, stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const db = h.fixture().connection.db,
    assignmentId = randomUUID();
  await db.insert(managerAssignments).values({
    id: assignmentId,
    userId: h.fixture().customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: h.fixture().ownerId,
    activatedAt: h.fixture().now,
  });
  try {
    await db.insert(managerInventoryGrants).values(
      ['stay_manage', 'finance_view', 'checkout_manage'].map((permission) => ({
        assignmentId,
        permission: permission as 'stay_manage',
        grantedAt: h.fixture().now,
      })),
    );
    const token = h.fixture().customerBToken;
    const repriced = await h.send(
      base + '/transfer',
      {
        expectedVersion: await h.version(stay.stayId),
        target: { kind: 'bed', roomId: item.roomId, bedId: item.otherSeatId },
        reason: 'Bigger bed',
        repricing: { rentAmountPaisa: rent + 1, residentAgreed: true },
      },
      token,
    );
    expect(repriced.statusCode).toBe(403);
    const extended = await h.send(
      base + '/extension',
      {
        expectedVersion: await h.version(stay.stayId),
        expectedLeaveDate: '2026-09-25',
        reason: 'x',
      },
      token,
    );
    expect(extended.statusCode).toBe(403);
    const deposit = await h.send(
      base + '/checkout',
      { expectedVersion: await h.version(stay.stayId), reason: 'x', applyAvailableDeposit: true },
      token,
    );
    expect(deposit.statusCode).toBe(403);
    expect(
      (
        await h.send(
          base + '/checkout',
          {
            expectedVersion: await h.version(stay.stayId),
            reason: 'Left',
            applyAvailableDeposit: false,
          },
          token,
        )
      ).statusCode,
    ).toBe(200);
  } finally {
    await db
      .delete(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId));
    await db
      .update(managerAssignments)
      .set({ status: 'deactivated' })
      .where(eq(managerAssignments.id, assignmentId));
  }
});
it('P9-FIX-01 / RES-005: a repriced transfer amends the agreement from the first unbilled period', async () => {
  const { item, stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const [first] = await h.invoices(stay.stayId);
  const [oldSchedule] = await h.schedules(stay.stayId);
  const body = (repricing: Record<string, unknown>) => ({
    target: { kind: 'bed', roomId: item.roomId, bedId: item.otherSeatId },
    reason: 'Moved to the larger bed',
    repricing,
  });
  const unagreed = await h.send(base + '/transfer', {
    expectedVersion: await h.version(stay.stayId),
    ...body({ rentAmountPaisa: rent + 500000 }),
  });
  expect(unagreed.statusCode).toBe(400);
  const moved = await h.ok(base + '/transfer', {
    expectedVersion: await h.version(stay.stayId),
    ...body({ rentAmountPaisa: rent + 500000, residentAgreed: true }),
  });
  expect(moved.agreement).toEqual(
    expect.objectContaining({
      previousRentPaisa: rent,
      rentAmountPaisa: rent + 500000,
      effectiveFrom: '2026-07-01',
    }),
  );
  const agreements = await h
    .fixture()
    .connection.db.select()
    .from(stayAgreements)
    .where(eq(stayAgreements.stayId, stay.stayId));
  expect(agreements.map((row) => [row.version, Number(row.rentAmountPaisa)]).sort()).toEqual([
    [1, rent],
    [2, rent + 500000],
  ]);
  const schedules = await h.schedules(stay.stayId);
  expect(schedules.map((row) => [row.state, Number(row.periodIndex)])).toEqual([
    ['superseded', 1],
    ['active', 1],
  ]);
  // The old job races the amendment and completes as obsolete; the new one bills the new rent.
  await h.moveTo('2026-07-06T10:00:00Z');
  await h.deliver(oldSchedule?.currentJobId ?? null);
  await h.deliver(schedules[1]?.currentJobId ?? null);
  await h.deliver(schedules[1]?.currentJobId ?? null);
  const invoices = await h.invoices(stay.stayId);
  expect(invoices.map((row) => Number(row.totalPaisa))).toEqual([rent, rent + 500000]);
  expect(invoices[0]).toEqual(first);
  await checkout(base, stay.stayId);
});
it('P9-FIX-02 / RENT-004: an extension tops up the short final period and resumes exhausted billing once', async () => {
  const { stay, base, rent } = await h.admitted(dailyProration, '2026-08-15');
  const [schedule] = await h.schedules(stay.stayId);
  await h.moveTo('2026-08-06T10:00:00Z');
  await h.deliver(schedule?.currentJobId ?? null);
  const [aug] = await h.schedules(stay.stayId);
  expect(aug?.state).toBe('exhausted');
  const augBilled = (await h.charges(stay.stayId)).find((row) => row.periodStart === '2026-08-01');
  expect(Number(augBilled?.amountPaisa)).toBeLessThan(rent);
  const extended = await h.ok(base + '/extension', {
    expectedVersion: await h.version(stay.stayId),
    expectedLeaveDate: '2026-10-15',
    reason: 'Semester extended',
  });
  expect(extended.billing).toEqual([
    expect.objectContaining({ item: 'rent', result: 'topped_up' }),
    expect.objectContaining({ item: 'rent', result: 'resumed' }),
  ]);
  const augustCharges = (await h.charges(stay.stayId)).filter(
    (row) =>
      row.periodStart !== null && row.periodStart >= '2026-08-01' && row.periodStart < '2026-09-01',
  );
  expect(augustCharges.reduce((sum, row) => sum + Number(row.amountPaisa), 0)).toBe(rent);
  const [resumed] = await h.schedules(stay.stayId);
  expect(resumed).toMatchObject({ state: 'active', periodIndex: 2n });
  await h.moveTo('2026-09-06T10:00:00Z');
  await Promise.all([
    h.deliver(resumed?.currentJobId ?? null),
    h.deliver(resumed?.currentJobId ?? null),
  ]);
  const september = (await h.charges(stay.stayId)).filter(
    (row) => row.periodStart === '2026-09-01',
  );
  expect(september.map((row) => Number(row.amountPaisa))).toEqual([rent]);
  const again = await h.ok(base + '/extension', {
    expectedVersion: await h.version(stay.stayId),
    expectedLeaveDate: '2026-11-15',
    reason: 'Extended again',
  });
  expect(again.billing).toEqual([]);
  await checkout(base, stay.stayId);
});
