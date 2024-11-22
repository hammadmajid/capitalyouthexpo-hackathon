import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants, residentFundMovements } from '@hsm/db';
import { stayFinalStatementResponseSchema } from '@hsm/contracts';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';

const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());

it('PAY-008 / OUT-004 / AUD-003: a partial refund with a lost response replays one movement beside the immutable statement', async () => {
  const { stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const [invoice] = await h.invoices(stay.stayId);
  const payment = await h.ok(base + '/payments', {
    amountPaisa: rent + 50000,
    method: 'cash',
    paidOn: h.date(),
    note: 'Rent and deposit paid directly',
    allocations: [{ invoiceId: invoice?.id, amountPaisa: rent }],
    depositPaisa: 50000,
    advanceCreditPaisa: 0,
  });
  await h.ok(base + '/checkout', {
    expectedVersion: 1,
    reason: 'Checkout before external refund',
    applyAvailableDeposit: false,
  });
  const read = async () => {
    const response = await h.get(
      '/v1/me/stays/' + stay.stayId + '/final-statement',
      h.fixture().customerAToken,
    );
    expect(response.statusCode, response.body).toBe(200);
    return stayFinalStatementResponseSchema.parse(response.json());
  };
  const before = await read(),
    key = randomUUID();
  const body = {
    paymentId: payment.paymentId,
    movement: {
      kind: 'deposit_refund',
      amountPaisa: 15000,
      reason: 'Partial refund already paid externally',
      externalReference: 'BANK-REPLAY',
    },
  };
  const first = await h.send(base + '/fund-movements', body, h.fixture().ownerToken, key);
  expect(first.statusCode, first.body).toBe(200);
  // The client has not received this result. It deliberately retries its original key/body.
  const replay = await h.send(base + '/fund-movements', body, h.fixture().ownerToken, key);
  expect(replay.statusCode, replay.body).toBe(200);
  expect(replay.json()).toEqual(first.json());
  const movements = await h
    .fixture()
    .connection.db.select()
    .from(residentFundMovements)
    .where(eq(residentFundMovements.stayId, stay.stayId));
  expect(movements).toHaveLength(1);
  const after = await read();
  expect(after.statement).toEqual(before.statement);
  expect(after.afterCheckout.movements).toHaveLength(1);
  expect(after.afterCheckout.current.deposit).toMatchObject({
    refundedPaisa: 15000,
    heldPaisa: 35000,
  });
  // A different payload cannot use the retained identity even if its amount is still available.
  const changed = await h.send(
    base + '/fund-movements',
    {
      ...body,
      movement: { ...body.movement, amountPaisa: 10000 },
    },
    h.fixture().ownerToken,
    key,
  );
  expect(changed.statusCode).toBe(409);
  const forbidden = await h.send(base + '/fund-movements', body, h.fixture().customerBToken, key);
  expect([403, 404]).toContain(forbidden.statusCode);
});

it('SEC-001 / PAY-008 / AUD-003: checkout replay rechecks payment_record after deposit authority is revoked', async () => {
  const { item, base } = await h.admitted(fullPeriod, '2026-08-25');
  const f = h.fixture(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  const grants = ['finance_view', 'checkout_manage', 'payment_record'] as const;
  await f.connection.db.insert(managerInventoryGrants).values(
    grants.map((permission) => ({
      assignmentId,
      permission,
      grantedAt: f.now,
    })),
  );
  const key = randomUUID(),
    body = {
      expectedVersion: 1,
      reason: 'Authorized deposit checkout',
      applyAvailableDeposit: true,
    };
  const first = await h.send(base + '/checkout', body, f.customerBToken, key);
  expect(first.statusCode, first.body).toBe(200);
  // Disposable fixture only: exercise the same live grant absence as revocation.
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'payment_record'),
      ),
    );
  const replay = await h.send(base + '/checkout', body, f.customerBToken, key);
  expect(replay.statusCode, replay.body).toBe(403);
});
