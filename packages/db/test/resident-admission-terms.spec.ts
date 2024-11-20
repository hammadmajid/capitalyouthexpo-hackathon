import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { billingAgreementTermsSchema } from '@hsm/contracts';
import {
  billingPolicies,
  residentChargeCatalog,
  stayAgreements,
  lockInventoryBranch,
} from '../src/index.js';
import { validateResidentAdmissionTerms } from '../src/resident-admission-terms.js';
import { lockResidentAdmissionTarget } from '../src/resident-admission-target.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope } from './resident-finance.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const f = await financeScope(harness);
  const [agreement] = await harness
    .database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, f.agreementId));
  if (!agreement) throw Error('Agreement fixture missing');
  return { ...f, terms: billingAgreementTermsSchema.parse(agreement.termsSnapshot) };
}
type Fixture = Awaited<ReturnType<typeof prepare>>;
function run(f: Fixture, terms = f.terms) {
  return harness.database().transaction(async (tx) => {
    await lockInventoryBranch(tx, f.branchId);
    await lockResidentAdmissionTarget(tx, {
      branchId: f.branchId,
      target: { kind: 'bed', roomId: f.roomId, bedId: f.seatId },
    });
    return validateResidentAdmissionTerms(tx, {
      branchId: f.branchId,
      brandId: f.brandId,
      roomTypeId: f.roomTypeId,
      terms,
    });
  });
}
async function catalogue(f: Fixture) {
  const id = v7();
  await harness.database().insert(residentChargeCatalog).values({
    id,
    branchId: f.branchId,
    code: 'laundry',
    name: 'Laundry',
    unitLabel: 'Bag',
    unitAmountPaisa: 12301n,
    createdByUserId: f.ownerId,
  });
  return {
    catalogId: id,
    code: 'laundry',
    name: 'Laundry',
    unitLabel: 'Bag',
    unitAmountPaisa: 12301,
  };
}
// Actual SQL policy/catalogue snapshot validation; not HTTP authorization or admission completion.
it('RENT-003: actual current branch policy retains exact explicit manual agreement without rewriting its historical snapshot', async () => {
  const f = await prepare();
  expect(await run(f)).toEqual(f.terms);
  const [row] = await harness
    .database()
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, f.agreementId));
  expect(row?.termsSnapshot).toEqual(f.terms);
});
it('RENT-003: actual room-type override supersedes branch policy only for a freshly agreed version', async () => {
  const f = await prepare(),
    id = v7(),
    policy = { ...f.terms.policy, noticeDays: 7 };
  await harness.database().insert(billingPolicies).values({
    id,
    branchId: f.branchId,
    roomTypeId: f.roomTypeId,
    policy,
    isCurrent: true,
    createdByUserId: f.ownerId,
  });
  await expect(run(f)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  const terms = { ...f.terms, policyVersionId: id, policy };
  expect(await run(f, terms)).toEqual(terms);
});
it('RENT-003: actual superseded policy cannot be reused even when its successor has identical financial facts', async () => {
  const f = await prepare(),
    id = v7();
  await harness.database().transaction(async (tx) => {
    await tx
      .update(billingPolicies)
      .set({ isCurrent: false })
      .where(eq(billingPolicies.id, f.terms.policyVersionId));
    await tx.insert(billingPolicies).values({
      id,
      branchId: f.branchId,
      policy: f.terms.policy,
      isCurrent: true,
      createdByUserId: f.ownerId,
    });
  });
  await expect(run(f)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await run(f, { ...f.terms, policyVersionId: id })).policyVersionId).toBe(id);
});
it('SEC-003 / RENT-003: actual policy identity never authorizes forged grace or notice facts', async () => {
  const f = await prepare();
  await expect(
    run(f, { ...f.terms, policy: { ...f.terms.policy, graceDays: 3 } }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('FIN-004: actual current catalogue selection preserves exact paisa and becomes unavailable after archive', async () => {
  const f = await prepare(),
    entry = await catalogue(f),
    terms = { ...f.terms, catalog: [entry] };
  expect(await run(f, terms)).toEqual(terms);
  await expect(
    run(f, { ...terms, catalog: [{ ...entry, unitAmountPaisa: 12302 }] }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await harness
    .database()
    .update(residentChargeCatalog)
    .set({ archivedAt: new Date() })
    .where(eq(residentChargeCatalog.id, entry.catalogId));
  await expect(run(f, terms)).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('SEC-003 / FIN-004: actual foreign branch catalogue ID cannot be disclosed as an approved local fee', async () => {
  const f = await prepare(),
    foreign = await prepare(),
    entry = await catalogue(foreign);
  await expect(run(f, { ...f.terms, catalog: [entry] })).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it('RENT-003: actual inherited hostel and platform policy are resolved without a guessed fallback', async () => {
  const f = await prepare(),
    platform = v7(),
    hostel = v7();
  await harness
    .database()
    .update(billingPolicies)
    .set({ isCurrent: false })
    .where(eq(billingPolicies.id, f.terms.policyVersionId));
  await expect(run(f)).rejects.toMatchObject({ code: 'CONFLICT' });
  await harness
    .database()
    .insert(billingPolicies)
    .values({ id: platform, policy: f.terms.policy, isCurrent: true, createdByUserId: f.ownerId });
  try {
    expect((await run(f, { ...f.terms, policyVersionId: platform })).policyVersionId).toBe(
      platform,
    );
    const policy = { ...f.terms.policy, graceDays: 2 };
    await harness.database().insert(billingPolicies).values({
      id: hostel,
      brandId: f.brandId,
      policy,
      isCurrent: true,
      createdByUserId: f.ownerId,
    });
    await expect(run(f, { ...f.terms, policyVersionId: platform })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await run(f, { ...f.terms, policyVersionId: hostel, policy })).policyVersionId).toBe(
      hostel,
    );
  } finally {
    await harness
      .database()
      .update(billingPolicies)
      .set({ isCurrent: false })
      .where(eq(billingPolicies.id, platform));
  }
});
it('ACC-004 / RENT-003: actual policy shared lock prevents a concurrent supersession during snapshot validation without sleeps', async () => {
  const f = await prepare();
  let markReady: (() => void) | undefined, release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  const locking = harness.database().transaction(async (tx) => {
    await validateResidentAdmissionTerms(tx, {
      branchId: f.branchId,
      brandId: f.brandId,
      roomTypeId: f.roomTypeId,
      terms: f.terms,
    });
    markReady?.();
    await hold;
  });
  const exclusive = () =>
    harness
      .database()
      .transaction((tx) =>
        tx
          .select({ id: billingPolicies.id })
          .from(billingPolicies)
          .where(eq(billingPolicies.id, f.terms.policyVersionId))
          .for('update', { noWait: true }),
      );
  await Promise.race([ready, locking]);
  try {
    await expect(exclusive()).rejects.toThrow();
  } finally {
    release?.();
    await locking;
  }
  expect(await exclusive()).toEqual([{ id: f.terms.policyVersionId }]);
});
