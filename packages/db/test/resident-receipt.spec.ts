import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { residents, residentReceipts } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, financeTime } from './resident-finance.fixture.js';
import { reverseRecordedPayment } from './resident-finance-reversal.fixture.js';
import { recordExternalResidentPayment } from '../src/resident-payment.js';
import { readResidentReceipt } from '../src/resident-receipt.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const f = await financeScope(harness);
  const payment = await harness.database().transaction((tx) =>
    recordExternalResidentPayment(
      tx,
      {
        scope: {
          branchId: f.branchId,
          stayId: f.stayId,
          actorUserId: f.ownerId,
          actorRole: 'owner',
        },
        commandId: randomUUID(),
        payment: {
          amountPaisa: 1001,
          method: 'cash',
          paidOn: '2028-02-01',
          note: 'Private staff note',
          allocations: [],
          depositPaisa: 1000,
          advanceCreditPaisa: 1,
        },
      },
      financeTime,
    ),
  );
  return { ...f, ...payment };
}
it('PAY-008 / FIN-001: actual approved receipt read retains historical party facts after resident rename and excludes source-private fields', async () => {
  const f = await prepare();
  const [stored] = await harness
    .database()
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.id, f.receiptId));
  if (!stored) throw new Error('Fixture receipt missing');
  await harness
    .database()
    .update(residents)
    .set({ displayName: 'Updated resident name' })
    .where(eq(residents.id, f.residentId));
  const value = await harness
    .database()
    .transaction((tx) =>
      readResidentReceipt(tx, { branchId: f.branchId, stayId: f.stayId, receiptId: f.receiptId }),
    );
  expect(value).toEqual({
    receiptId: f.receiptId,
    receiptNumber: stored.number,
    issuedAt: stored.issuedAt.toISOString(),
    snapshot: stored.snapshot,
    reversed: false,
  });
  expect(value.snapshot.residentName).toBe('Finance fixture resident');
  expect(value).not.toHaveProperty('note');
  expect(value).not.toHaveProperty('proofFileId');
});
it('PAY-008: actual full Owner reversal preserves original receipt and exposes a derived reversed marker', async () => {
  const f = await prepare(),
    scope = { branchId: f.branchId, stayId: f.stayId, receiptId: f.receiptId };
  const before = await harness.database().transaction((tx) => readResidentReceipt(tx, scope));
  await harness.database().transaction((tx) => reverseRecordedPayment(tx, f, f.paymentId));
  const after = await harness.database().transaction((tx) => readResidentReceipt(tx, scope));
  expect(after).toEqual({ ...before, reversed: true });
});
it.each(['branch', 'stay'] as const)(
  'SEC-003: actual foreign %s receipt scope returns opaque404',
  async (kind) => {
    const f = await prepare(),
      foreign = await financeScope(harness);
    await expect(
      harness.database().transaction((tx) =>
        readResidentReceipt(tx, {
          branchId: kind === 'branch' ? foreign.branchId : f.branchId,
          stayId: foreign.stayId,
          receiptId: f.receiptId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  },
);
