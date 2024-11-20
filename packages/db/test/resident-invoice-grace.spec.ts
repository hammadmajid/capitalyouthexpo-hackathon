import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { billingPolicies, stayAgreements, readResidentInvoiceBalance } from '../src/index.js';
import { billingAgreementTermsSchema } from '@hsm/contracts';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope, financeTime, postRent, issueInvoice } from './resident-finance.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
it('RB-002 / FIN-002: real invoice grace follows the original immutable agreement after a current policy change', async () => {
  const scope = await financeScope(harness, { graceDays: 3 });
  const invoiceId = await harness.database().transaction(async (transaction) => {
    const charge = await postRent(transaction, scope);
    return issueInvoice(transaction, scope, charge);
  });
  const read = (today: string) =>
    harness.database().transaction((transaction) =>
      readResidentInvoiceBalance(transaction, {
        branchId: scope.branchId,
        stayId: scope.stayId,
        invoiceId,
        today,
      }),
    );
  expect(await read('2028-02-06')).toMatchObject({
    graceDays: 3,
    state: 'issued',
    outstandingPaisa: 1800001,
  });
  expect((await read('2028-02-08')).state).toBe('issued');
  expect((await read('2028-02-09')).state).toBe('overdue');
  const [agreement] = await harness
    .database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, scope.agreementId));
  if (!agreement) throw new Error('Missing fixture agreement');
  const original = billingAgreementTermsSchema.parse(agreement.termsSnapshot);
  await harness.database().transaction(async (transaction) => {
    await transaction
      .update(billingPolicies)
      .set({ isCurrent: false })
      .where(eq(billingPolicies.id, original.policyVersionId));
    await transaction.insert(billingPolicies).values({
      id: v7(),
      branchId: scope.branchId,
      policy: { ...original.policy, graceDays: 20 },
      isCurrent: true,
      createdByUserId: scope.ownerId,
      createdAt: financeTime,
    });
  });
  expect(await read('2028-02-09')).toMatchObject({
    graceDays: 3,
    state: 'overdue',
    outstandingPaisa: 1800001,
  });
});
