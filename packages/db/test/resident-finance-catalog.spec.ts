import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  residentChargeCatalog,
  residentCharges,
  residentLedger,
  stayAgreements,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, type FinanceScope } from './resident-finance.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());

async function postCustom(
  scope: FinanceScope,
  catalogId: string,
  agreementId: string,
  amount: bigint,
) {
  return harness.database().transaction(async (transaction) => {
    const id = v7();
    await transaction.insert(residentCharges).values({
      id,
      branchId: scope.branchId,
      stayId: scope.stayId,
      agreementId,
      catalogId,
      kind: 'custom',
      sourceKey: `wash:${id}`,
      descriptionSnapshot: 'Three agreed washes',
      quantity: 3,
      amountPaisa: amount,
      postedByUserId: scope.ownerId,
    });
    await transaction.insert(residentLedger).values({
      id: v7(),
      branchId: scope.branchId,
      stayId: scope.stayId,
      chargeId: id,
      account: 'receivable',
      side: 'debit',
      amountPaisa: amount,
    });
    return id;
  });
}

it('FIN-004 / CHG-009: custom charge requires the exact immutable catalog rate disclosed in an agreement', async () => {
  const scope = await financeScope(harness),
    catalogId = v7(),
    agreementId = v7();
  await harness.database().insert(residentChargeCatalog).values({
    id: catalogId,
    branchId: scope.branchId,
    code: 'laundry',
    name: 'Laundry',
    unitLabel: 'wash',
    unitAmountPaisa: 20001n,
    createdByUserId: scope.ownerId,
  });
  await expect(postCustom(scope, catalogId, scope.agreementId, 60003n)).rejects.toThrow();
  const [original] = await harness
    .database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, scope.agreementId));
  if (!original) throw new Error('Agreement fixture missing');
  await harness
    .database()
    .insert(stayAgreements)
    .values({
      ...original,
      id: agreementId,
      version: 2,
      reason: 'Explicit laundry agreement amendment',
      termsSnapshot: {
        ...original.termsSnapshot,
        catalog: [
          {
            catalogId,
            code: 'laundry',
            name: 'Laundry',
            unitLabel: 'wash',
            unitAmountPaisa: 20001,
          },
        ],
      },
    });
  await expect(postCustom(scope, catalogId, agreementId, 60004n)).rejects.toThrow();
  const chargeId = await postCustom(scope, catalogId, agreementId, 60003n);
  const [charge] = await harness
    .database()
    .select()
    .from(residentCharges)
    .where(eq(residentCharges.id, chargeId));
  expect(charge?.amountPaisa).toBe(60003n);
  await expect(
    harness
      .database()
      .update(residentChargeCatalog)
      .set({ unitAmountPaisa: 30001n })
      .where(eq(residentChargeCatalog.id, catalogId)),
  ).rejects.toThrow();
  const [unchanged] = await harness
    .database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, scope.agreementId));
  expect(unchanged?.termsSnapshot.catalog).toEqual([]);
  await harness
    .database()
    .update(residentChargeCatalog)
    .set({ archivedAt: new Date() })
    .where(eq(residentChargeCatalog.id, catalogId));
  await expect(postCustom(scope, catalogId, agreementId, 60003n)).rejects.toThrow();
});
