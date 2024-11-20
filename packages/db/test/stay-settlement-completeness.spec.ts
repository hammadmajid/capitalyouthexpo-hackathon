import { reverseRecordedPayment } from './resident-finance-reversal.fixture.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readStaySettlement } from '../src/stay-settlement.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  financeScope,
  issueInvoice,
  postRent,
  receivePayment,
} from './resident-finance.fixture.js';
import { accountBalance } from './resident-finance-balances.fixture.js';

const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());

it.each([0, 1, 200, 201, 225])(
  'OUT-005 / FIN-002 / AUD-001: all %i invoices contribute to settlement, independently of bounded details',
  async (count) => {
    const f = await financeScope(harness);
    await harness.database().transaction(async (tx) => {
      for (let index = 0; index < count; index += 1) {
        const charge = await postRent(tx, f, 10000n, 'settlement:' + index);
        await issueInvoice(tx, f, charge, 10000n);
      }
    });
    const result = await harness
      .database()
      .transaction((tx) =>
        readStaySettlement(tx, { branchId: f.branchId, stayId: f.stayId, today: '2028-02-10' }),
      );
    expect(result.invoices).toHaveLength(Math.min(count, 200));
    expect(result.invoicesTruncated).toBe(count > 200);
    expect(result.outstandingPaisa).toBe(count * 10000);
    expect(result.netPayablePaisa).toBe(count * 10000);
    expect(BigInt(result.outstandingPaisa)).toBe(
      await accountBalance(harness.database(), f, 'receivable'),
    );
  },
);

it('OUT-005 / RENT-005 / AUD-001: later unpaid debt, partial payment, advance and deposit reconcile beyond the detail page', async () => {
  const f = await financeScope(harness);
  await harness.database().transaction(async (tx) => {
    for (let index = 0; index < 202; index += 1) {
      const charge = await postRent(tx, f, 10000n, 'mixed:' + index);
      const invoiceId = await issueInvoice(tx, f, charge, 10000n);
      if (index < 201)
        await receivePayment(tx, f, {
          amount: index === 200 ? 4000n : 10000n,
          allocations: [{ invoiceId, amount: index === 200 ? 4000n : 10000n }],
          deposit: 0n,
          advance: 0n,
        });
    }
    await receivePayment(tx, f, { amount: 7000n, allocations: [], deposit: 5000n, advance: 2000n });
  });
  const result = await harness
    .database()
    .transaction((tx) =>
      readStaySettlement(tx, { branchId: f.branchId, stayId: f.stayId, today: '2028-02-10' }),
    );
  expect(result).toMatchObject({
    outstandingPaisa: 16000,
    deposit: { heldPaisa: 5000 },
    advance: { heldPaisa: 2000 },
    netPayablePaisa: 9000,
    netRefundablePaisa: 0,
  });
  expect(BigInt(result.outstandingPaisa)).toBe(
    await accountBalance(harness.database(), f, 'receivable'),
  );
});

it('OUT-004/005 / AUD-001: a held deposit older than 100 spent payments remains a usable source', async () => {
  const f = await financeScope(harness);
  const paymentId = await harness.database().transaction(async (tx) => {
    const oldest = await receivePayment(tx, f, {
      amount: 5000n,
      allocations: [],
      deposit: 5000n,
      advance: 0n,
    });
    for (let index = 0; index < 101; index += 1) {
      const charge = await postRent(tx, f, 100n, 'paid:' + index);
      const invoiceId = await issueInvoice(tx, f, charge, 100n);
      await receivePayment(tx, f, {
        amount: 100n,
        allocations: [{ invoiceId, amount: 100n }],
        deposit: 0n,
        advance: 0n,
      });
    }
    return oldest;
  });
  const result = await harness
    .database()
    .transaction((tx) =>
      readStaySettlement(tx, { branchId: f.branchId, stayId: f.stayId, today: '2028-02-10' }),
    );
  expect(result.fundSources).toEqual([
    expect.objectContaining({ paymentId, depositPaisa: 5000, advanceCreditPaisa: 0 }),
  ]);
});

it('PAY-008: last-payment summary requires an actual receipt and excludes reversed records', async () => {
  const f = await financeScope(harness);
  const paymentId = await harness.database().transaction(async (tx) => {
    const first = await receivePayment(tx, f, {
      amount: 1000n,
      allocations: [],
      deposit: 1000n,
      advance: 0n,
    });
    const second = await receivePayment(tx, f, {
      amount: 2000n,
      allocations: [],
      deposit: 2000n,
      advance: 0n,
    });
    await reverseRecordedPayment(tx, f, second);
    return first;
  });
  const result = await harness
    .database()
    .transaction((tx) =>
      readStaySettlement(tx, { branchId: f.branchId, stayId: f.stayId, today: '2028-02-10' }),
    );
  expect(result.lastApprovedPayment).toMatchObject({
    paymentId,
    amountPaisa: 1000,
    receivedOn: '2028-02-01',
  });
  expect(result.lastApprovedPayment?.receiptNumber).toBeTruthy();
  expect(result.nextInvoiceDueDate).toBeNull();
});
