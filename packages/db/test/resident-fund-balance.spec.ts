import { afterAll, beforeAll, expect, it } from 'vitest';
import { inventoryHarness } from './inventory.fixture.js';
import {
  financeScope,
  receivePayment,
  postRent,
  issueInvoice,
  applyDeposit,
} from './resident-finance.fixture.js';
import { reverseRecordedPayment } from './resident-finance-reversal.fixture.js';
import { readResidentFundBalance } from '../src/resident-fund-balance.js';
import { readResidentFundBalances } from '../src/resident-fund-balances.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function read(scope: { branchId: string; stayId: string }) {
  return harness.database().transaction(async (tx) => {
    const single = await readResidentFundBalance(tx, {
      branchId: scope.branchId,
      stayId: scope.stayId,
    });
    const batch = await readResidentFundBalances(tx, {
      branchId: scope.branchId,
      stayIds: [scope.stayId],
    });
    expect(batch).toEqual([{ stayId: scope.stayId, ...single }]);
    return single;
  });
}
it('RENT-005: actual empty Stay has exact zero held funds without any invented required deposit', async () => {
  const scope = await financeScope(harness);
  expect(await read(scope)).toEqual({
    deposit: {
      receivedPaisa: 0,
      appliedToRentPaisa: 0,
      deductedPaisa: 0,
      refundedPaisa: 0,
      heldPaisa: 0,
    },
    advance: { receivedPaisa: 0, appliedToRentPaisa: 0, refundedPaisa: 0, availablePaisa: 0 },
  });
});
it('RENT-005 / PAY-008: actual approved receipt partitions deposit and advance without rent revenue', async () => {
  const scope = await financeScope(harness);
  await harness
    .database()
    .transaction((tx) =>
      receivePayment(tx, scope, { amount: 1501n, allocations: [], deposit: 1001n, advance: 500n }),
    );
  expect(await read(scope)).toMatchObject({
    deposit: { receivedPaisa: 1001, heldPaisa: 1001 },
    advance: { receivedPaisa: 500, availablePaisa: 500 },
  });
});
it('RENT-005 / PAY-008: actual deposit application reduces held deposit and leaves original received amount unchanged', async () => {
  const scope = await financeScope(harness);
  await harness.database().transaction(async (tx) => {
    const charge = await postRent(tx, scope),
      invoice = await issueInvoice(tx, scope, charge);
    const payment = await receivePayment(tx, scope, {
      amount: 1501n,
      allocations: [],
      deposit: 1001n,
      advance: 500n,
    });
    await applyDeposit(tx, scope, payment, invoice, 200n);
  });
  expect(await read(scope)).toMatchObject({
    deposit: { receivedPaisa: 1001, appliedToRentPaisa: 200, heldPaisa: 801 },
    advance: { receivedPaisa: 500, availablePaisa: 500 },
  });
});
it('PAY-008 / RENT-005: actual unused-funds payment reversal removes net receipts without inventing refunds', async () => {
  const scope = await financeScope(harness);
  const payment = await harness
    .database()
    .transaction((tx) =>
      receivePayment(tx, scope, { amount: 1501n, allocations: [], deposit: 1001n, advance: 500n }),
    );
  await harness.database().transaction((tx) => reverseRecordedPayment(tx, scope, payment));
  expect(await read(scope)).toEqual({
    deposit: {
      receivedPaisa: 0,
      appliedToRentPaisa: 0,
      deductedPaisa: 0,
      refundedPaisa: 0,
      heldPaisa: 0,
    },
    advance: { receivedPaisa: 0, appliedToRentPaisa: 0, refundedPaisa: 0, availablePaisa: 0 },
  });
});
it('SEC-003: actual foreign branch/Stay cannot read another resident fund balance', async () => {
  const own = await financeScope(harness),
    foreign = await financeScope(harness);
  await expect(read({ branchId: own.branchId, stayId: foreign.stayId })).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
  });
  await expect(
    harness.database().transaction((tx) =>
      readResidentFundBalances(tx, {
        branchId: own.branchId,
        stayIds: [foreign.stayId],
      }),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
});
