import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  residentLedger,
  stayFinalStatements,
} from '@hsm/db';
import { stayCheckoutResultSchema } from '@hsm/contracts';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';

const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());

it('OUT-005 / PAY-008 / AUD-001: actual HTTP checkout persists and replays complete settlement beyond 200 invoices', async () => {
  const { stay, item, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const f = h.fixture();
  await f.connection.db.transaction(async (tx) => {
    for (let index = 0; index < 200; index += 1) {
      const chargeId = randomUUID(),
        invoiceId = randomUUID();
      const scope = { branchId: item.branchId, stayId: stay.stayId };
      await tx.insert(residentCharges).values({
        id: chargeId,
        ...scope,
        agreementId: stay.agreementId,
        kind: 'rent',
        sourceKey: 'audit-http:' + index,
        descriptionSnapshot: 'Agreed rent fixture',
        amountPaisa: 10000n,
        quantity: 1,
        periodStart: h.date(),
        periodEnd: '2026-07-01',
        postedByUserId: f.ownerId,
        postedAt: h.clock(),
      });
      await tx.insert(residentLedger).values({
        ...scope,
        chargeId,
        account: 'receivable',
        side: 'debit',
        amountPaisa: 10000n,
        postedAt: h.clock(),
      });
      await tx.insert(residentInvoices).values({
        id: invoiceId,
        ...scope,
        number: 'INV-' + invoiceId,
        totalPaisa: 10000n,
        dueDate: h.date(),
        state: 'issued',
        issuedByUserId: f.ownerId,
        issuedAt: h.clock(),
      });
      await tx.insert(residentInvoiceCharges).values({ ...scope, invoiceId, chargeId });
    }
  });
  await h.ok(base + '/payments', {
    amountPaisa: rent + 2000000,
    method: 'cash',
    paidOn: h.date(),
    note: 'Deposit received externally',
    allocations: [],
    depositPaisa: rent + 2000000,
    advanceCreditPaisa: 0,
  });
  const body = {
    expectedVersion: 1,
    reason: 'Verified complete settlement',
    applyAvailableDeposit: true,
  };
  const key = randomUUID();
  const response = await h.send(base + '/checkout', body, f.ownerToken, key);
  expect(response.statusCode, response.body).toBe(200);
  const result = stayCheckoutResultSchema.parse(response.json());
  expect(result.depositApplied).toHaveLength(201);
  expect(result.statement.outstandingPaisa).toBe(0);
  const [frozen] = await f.connection.db
    .select()
    .from(stayFinalStatements)
    .where(eq(stayFinalStatements.stayId, stay.stayId));
  expect(frozen?.snapshot).toEqual(result.statement);
  const replay = await h.send(base + '/checkout', body, f.ownerToken, key);
  expect(replay.statusCode, replay.body).toBe(200);
  expect(replay.json()).toEqual(result);
}, 60000);
