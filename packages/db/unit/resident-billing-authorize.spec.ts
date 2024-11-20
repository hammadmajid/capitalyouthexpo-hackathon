import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { billingAgreementTermsSchema } from '@hsm/contracts';
import { authorizeResidentBilling } from '../src/resident-billing-authorize.js';
import {
  hostelAuditLog,
  notificationOutbox,
  residentBillingSchedules,
} from '../src/schema/index.js';
import {
  rentCommand,
  rentTime,
  rentTerms,
  rentStay,
  rentAgreement,
  rentQueryFixture,
} from './resident-rent.fixture.js';
const input = {
  ...rentCommand,
  organizationId: randomUUID(),
  actorRole: 'owner',
  dispatch: 'immediate',
  item: 'rent',
  cadence: 'periodic',
};
function fixture(
  options: Parameters<typeof rentQueryFixture>[0] = {},
  fail?: unknown,
  missingAudit = false,
) {
  const f = rentQueryFixture(options),
    writes: { table: unknown; value: Record<string, unknown> }[] = [];
  const tx = {
    ...f.transaction,
    insert(table: unknown) {
      return {
        values(value: Record<string, unknown>) {
          const result = () => {
            if (table === fail) throw new Error('Fixture write failed');
            writes.push({ table, value });
          };
          return {
            returning() {
              result();
              return Promise.resolve(missingAudit ? [] : [{ id: 7n }]);
            },
            then(resolve: (v: undefined) => unknown, reject: (e: unknown) => unknown) {
              return Promise.resolve()
                .then(() => {
                  result();
                  return undefined;
                })
                .then(resolve, reject);
            },
          };
        },
      };
    },
  };
  return { tx: tx as unknown as Parameters<typeof authorizeResidentBilling>[0], writes };
}
it('RENT-004 / AUD-004: explicit admission selection creates exact human authorization, one job and one schedule in order', async () => {
  const f = fixture();
  const result = await authorizeResidentBilling(f.tx, input, rentTime);
  expect(f.writes.map((row) => row.table)).toEqual([
    hostelAuditLog,
    notificationOutbox,
    residentBillingSchedules,
  ]);
  expect(f.writes[0]?.value).toMatchObject({
    actorUserId: input.actorUserId,
    actorRole: 'owner',
    targetId: result.id,
    after: { agreementId: input.agreementId, item: 'rent', cadence: 'periodic', periodIndex: 0 },
  });
  expect(f.writes[1]?.value).toMatchObject({
    id: result.currentJobId,
    channel: 'internal',
    eventType: 'resident.billing.period',
    payload: { scheduleId: result.id, version: 1, periodIndex: 0 },
    dedupeKey: 'resident.billing:' + result.id + ':v1:p0',
    nextAttemptAt: rentTime,
  });
  expect(f.writes[2]?.value).toMatchObject({
    id: result.id,
    authorizedByUserId: input.actorUserId,
    authorizationAuditId: 7n,
    state: 'active',
    version: 1,
    periodIndex: 0n,
    currentJobId: result.currentJobId,
    nextRunAt: rentTime,
  });
});
it('RENT-004: authorized Manager attribution stays human and explicit zero still advances through the worker', async () => {
  const terms = { ...rentTerms, rentAmountPaisa: 0 };
  const f = fixture({ agreement: [rentAgreement({ rentAmountPaisa: 0n, termsSnapshot: terms })] });
  const result = await authorizeResidentBilling(f.tx, { ...input, actorRole: 'manager' }, rentTime);
  expect(result.state).toBe('active');
  expect(f.writes[0]?.value.actorRole).toBe('manager');
});
it('RENT-004: manual initial partial period pauses without a job or invented amount', async () => {
  const terms = billingAgreementTermsSchema.parse({
    ...rentTerms,
    policy: { ...rentTerms.policy, proration: { kind: 'manual' } },
  });
  const f = fixture({
    stay: [rentStay({ moveInDate: '2028-02-10' })],
    agreement: [rentAgreement({ termsSnapshot: terms })],
  });
  expect(await authorizeResidentBilling(f.tx, input, rentTime)).toMatchObject({
    state: 'manual_required',
    currentJobId: null,
  });
  expect(f.writes.map((row) => row.table)).toEqual([hostelAuditLog, residentBillingSchedules]);
});
it('RENT-004: explicit exhausted initial cursor never backfills or schedules earlier periods', async () => {
  const f = fixture();
  expect(
    await authorizeResidentBilling(f.tx, { ...input, periodIndex: 3 }, rentTime),
  ).toMatchObject({ state: 'exhausted', periodIndex: 3, currentJobId: null });
  expect(f.writes[1]?.value).toMatchObject({ periodIndex: 3n, nextRunAt: null });
});
it.each([hostelAuditLog, notificationOutbox, residentBillingSchedules])(
  'AUD-004 / ACC-004: required authorization write failure %# propagates to caller rollback',
  async (table) => {
    const f = fixture({}, table);
    await expect(authorizeResidentBilling(f.tx, input, rentTime)).rejects.toThrow(
      'Fixture write failed',
    );
  },
);
it('AUD-004: absent returned audit cannot authorize a schedule', async () => {
  const f = fixture({}, undefined, true);
  await expect(authorizeResidentBilling(f.tx, input, rentTime)).rejects.toThrow(
    'Billing authorization audit unavailable',
  );
  expect(f.writes).toHaveLength(1);
});
it.each([
  { actorRole: 'system' },
  { actorUserId: undefined },
  { periodIndex: -1 },
  { amountPaisa: 1 },
  { item: 'custom' },
  { organizationId: 'invalid' },
])('SEC-003: invalid or fabricated schedule command %# has no writes', async (patch) => {
  const f = fixture();
  await expect(authorizeResidentBilling(f.tx, { ...input, ...patch }, rentTime)).rejects.toThrow();
  expect(f.writes).toEqual([]);
});
it('RENT-003: obsolete agreement selection fails before authorization', async () => {
  const f = fixture({ agreement: [] });
  await expect(authorizeResidentBilling(f.tx, input, rentTime)).rejects.toThrow(
    'Agreed charge requires an explicit adjustment',
  );
  expect(f.writes).toEqual([]);
});

it('RENT-004: recurring authorization waits for its calculated future due instant instead of initial admission time', async () => {
  const f = fixture();
  const now = new Date('2028-02-01T06:00:00Z');
  await authorizeResidentBilling(f.tx, { ...input, dispatch: 'on_due_date' }, now);
  expect(f.writes[1]?.value.nextAttemptAt).toEqual(new Date('2028-02-05T00:00:00Z'));
  expect(f.writes[2]?.value.nextRunAt).toEqual(new Date('2028-02-05T00:00:00Z'));
});
