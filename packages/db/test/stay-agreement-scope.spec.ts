import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { billingPolicies, stayAgreements } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope } from './resident-finance.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function agreement() {
  const scope = await financeScope(harness);
  const [row] = await harness
    .database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, scope.agreementId));
  if (!row) throw new Error('Agreement fixture missing');
  return { scope, row };
}
it.each(['branch', 'hostel'] as const)(
  'ACC-004 / RENT-003: agreement rejects another %s policy even with matching snapshot',
  async (level) => {
    const { scope, row } = await agreement(),
      other = await harness.scope(),
      policyId = v7();
    await harness
      .database()
      .insert(billingPolicies)
      .values({
        id: policyId,
        ...(level === 'branch' ? { branchId: other.branchId } : { brandId: other.brandId }),
        policy: row.termsSnapshot.policy as Record<string, unknown>,
        isCurrent: true,
        createdByUserId: other.ownerId,
      });
    await expect(
      harness
        .database()
        .insert(stayAgreements)
        .values({
          ...row,
          id: v7(),
          version: 2,
          policyVersionId: policyId,
          termsSnapshot: { ...row.termsSnapshot, policyVersionId: policyId },
        }),
    ).rejects.toThrow();
    expect(
      await harness
        .database()
        .select()
        .from(stayAgreements)
        .where(eq(stayAgreements.stayId, scope.stayId)),
    ).toHaveLength(1);
  },
);
it.each([{ rentAmountPaisa: 1 }, { depositPaisa: 0 }, { policy: {} }, { currency: 'USD' }])(
  'RENT-003: agreement rejects rewritten disclosed facts %j',
  async (patch) => {
    const { row } = await agreement();
    await expect(
      harness
        .database()
        .insert(stayAgreements)
        .values({
          ...row,
          id: v7(),
          version: 2,
          termsSnapshot: { ...row.termsSnapshot, ...patch },
        }),
    ).rejects.toThrow();
  },
);
it('RENT-003 / ACC-004: room-type policy requires a verified assignment or original booking type', async () => {
  const { scope, row } = await agreement(),
    policyId = v7();
  await harness
    .database()
    .insert(billingPolicies)
    .values({
      id: policyId,
      branchId: scope.branchId,
      roomTypeId: scope.roomTypeId,
      policy: row.termsSnapshot.policy as Record<string, unknown>,
      isCurrent: true,
      createdByUserId: scope.ownerId,
    });
  await expect(
    harness
      .database()
      .insert(stayAgreements)
      .values({
        ...row,
        id: v7(),
        version: 2,
        policyVersionId: policyId,
        termsSnapshot: { ...row.termsSnapshot, policyVersionId: policyId },
      }),
  ).rejects.toThrow();
});

it.each(['hostel', 'platform'] as const)(
  'RENT-003: scoped %s inheritance preserves the exact explicitly selected version',
  async (level) => {
    const { scope, row } = await agreement(),
      policyId = v7();
    await harness
      .database()
      .insert(billingPolicies)
      .values({
        id: policyId,
        ...(level === 'hostel' ? { brandId: scope.brandId } : {}),
        policy: row.termsSnapshot.policy as Record<string, unknown>,
        isCurrent: true,
        createdByUserId: scope.ownerId,
      });
    const id = v7();
    await harness
      .database()
      .insert(stayAgreements)
      .values({
        ...row,
        id,
        version: 2,
        policyVersionId: policyId,
        termsSnapshot: { ...row.termsSnapshot, policyVersionId: policyId },
      });
    await harness
      .database()
      .update(billingPolicies)
      .set({ isCurrent: false })
      .where(eq(billingPolicies.id, policyId));
    const [saved] = await harness
      .database()
      .select()
      .from(stayAgreements)
      .where(eq(stayAgreements.id, id));
    expect(saved?.policyVersionId).toBe(policyId);
    expect(saved?.termsSnapshot.policy).toEqual(row.termsSnapshot.policy);
  },
);
