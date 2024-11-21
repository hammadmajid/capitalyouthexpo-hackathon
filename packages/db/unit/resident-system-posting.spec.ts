import { money } from '@hsm/contracts';
import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  postPlannedResidentCharge,
  type PlannedResidentCharge,
} from '../src/resident-charge-posting.js';
import { financialPostingScopeSchema } from '../src/resident-posting-context.js';
import {
  residentBillingOrigins,
  residentCharges,
  residentInvoices,
  residentInvoiceCharges,
  residentLedger,
} from '../src/schema/index.js';
import { rentIds, rentTime, rentQueryFixture, rentCharge } from './resident-rent.fixture.js';
const scope = {
  branchId: rentIds.branch,
  stayId: rentIds.stay,
  agreementId: rentIds.agreement,
  executionId: randomUUID(),
};
const plan: PlannedResidentCharge = {
  kind: 'rent',
  sourceKey: 'rent:2028-02-01:2028-03-01',
  description: 'Agreed rent',
  periodStart: '2028-02-01',
  periodEnd: '2028-03-01',
  dueDate: '2028-02-05',
  amountPaisa: money(1800001n),
};
it('AUD-004 / FIN-002: a system posting uses no human actor and binds exact immutable execution sources', async () => {
  const f = rentQueryFixture();
  const result = await postPlannedResidentCharge(f.transaction, scope, plan, rentTime);
  expect(result.status).toBe('posted');
  expect(f.writes.map((row) => row.table)).toEqual([
    residentCharges,
    residentLedger,
    residentInvoices,
    residentInvoiceCharges,
    residentBillingOrigins,
  ]);
  expect(f.writes[0]?.value).toMatchObject({
    id: result.chargeId,
    postedByUserId: null,
    amountPaisa: plan.amountPaisa,
  });
  expect(f.writes[2]?.value).toMatchObject({
    id: result.invoiceId,
    issuedByUserId: null,
    totalPaisa: plan.amountPaisa,
    state: 'issued',
  });
  expect(f.writes[4]?.value).toEqual({
    ...scope,
    chargeId: result.chargeId,
    invoiceId: result.invoiceId,
  });
});
it.each([null, rentIds.actor])(
  'RENT-004 / AUD-004: recovery retains existing actor %s without manufacturing a new execution origin',
  async (actor) => {
    const f = rentQueryFixture({ previous: [rentCharge({ postedByUserId: actor })] });
    expect(await postPlannedResidentCharge(f.transaction, scope, plan, rentTime)).toEqual({
      status: 'already_posted',
      chargeId: rentIds.charge,
      invoiceId: rentIds.invoice,
    });
    expect(f.writes).toEqual([]);
  },
);
it('PAY-008: an explicit zero system charge creates no financial source or origin', async () => {
  const f = rentQueryFixture();
  expect(
    await postPlannedResidentCharge(
      f.transaction,
      scope,
      { ...plan, amountPaisa: money(0n) },
      rentTime,
    ),
  ).toEqual({ status: 'no_charge', chargeId: null, invoiceId: null });
  expect(f.writes).toEqual([]);
});
it('AUD-004 / ACC-004: origin persistence failure propagates to the owning transaction', async () => {
  const f = rentQueryFixture({ fail: residentBillingOrigins });
  await expect(postPlannedResidentCharge(f.transaction, scope, plan, rentTime)).rejects.toThrow(
    'Posting write failed',
  );
});
it.each([
  { actorUserId: rentIds.actor, executionId: scope.executionId },
  {},
  { actorUserId: null },
  { executionId: null },
  { executionId: 'invalid' },
  { actorUserId: 'invalid' },
])('SEC-003 / AUD-004: missing, malformed or mixed attribution fails closed: %j', (origin) => {
  expect(
    financialPostingScopeSchema.safeParse({
      branchId: scope.branchId,
      stayId: scope.stayId,
      agreementId: scope.agreementId,
      ...origin,
    }).success,
  ).toBe(false);
});
