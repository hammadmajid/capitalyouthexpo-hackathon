import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { postAgreedFeePeriod } from '../src/resident-fees.js';
import {
  residentCharges,
  residentLedger,
  residentInvoices,
  residentInvoiceCharges,
  stays,
} from '../src/schema/index.js';
import { rentIds as ids, rentTime as now, rentStay } from './resident-rent.fixture.js';
import {
  feeTerms,
  feeCommand as command,
  oneTimeCommand,
  feeAgreement,
  feeCharge,
  feeQueryFixture,
} from './resident-fees.fixture.js';
it('FIN-004 / RENT-003: exact monthly fee uses the shared locked transaction and its own rate/due date, not weekly rent', async () => {
  const f = feeQueryFixture(),
    result = await postAgreedFeePeriod(f.transaction, command, now);
  expect(result.status).toBe('posted');
  expect(f.locks).toEqual([{ table: stays, mode: 'update' }]);
  expect(f.writes.map((row) => row.table)).toEqual([
    residentCharges,
    residentLedger,
    residentInvoices,
    residentInvoiceCharges,
  ]);
  expect(f.writes[0]?.value).toMatchObject({
    branchId: ids.branch,
    stayId: ids.stay,
    agreementId: ids.agreement,
    kind: 'mess',
    quantity: 1,
    sourceKey: 'fee:mess:monthly:2028-02-01:2028-03-01',
    amountPaisa: 3101n,
    postedByUserId: ids.actor,
    periodStart: '2028-02-01',
    periodEnd: '2028-03-01',
  });
  expect(f.writes[1]?.value).toMatchObject({
    chargeId: result.chargeId,
    account: 'receivable',
    side: 'debit',
    amountPaisa: 3101n,
  });
  expect(f.writes[2]?.value).toMatchObject({
    id: result.invoiceId,
    totalPaisa: 3101n,
    dueDate: '2028-02-07',
    state: 'issued',
    issuedByUserId: ids.actor,
  });
  expect(f.writes[3]?.value).toMatchObject({
    invoiceId: result.invoiceId,
    chargeId: result.chargeId,
  });
  const scope = f.predicates[0];
  if (!scope) throw new Error('Missing scoped Stay read');
  expect(new PgDialect().sqlToQuery(scope.value).params).toEqual([ids.branch, ids.stay]);
});
it('FIN-004: exact one-time fee has no recurring period and its configured due offset', async () => {
  const f = feeQueryFixture();
  expect((await postAgreedFeePeriod(f.transaction, oneTimeCommand, now)).status).toBe('posted');
  expect(f.writes[0]?.value).toMatchObject({
    kind: 'utilities',
    sourceKey: 'fee:utilities:one_time',
    periodStart: null,
    periodEnd: null,
    amountPaisa: 777n,
  });
  expect(f.writes[2]?.value).toMatchObject({ totalPaisa: 777n, dueDate: '2028-02-03' });
});
it.each([
  { input: command, previous: feeCharge() },
  {
    input: oneTimeCommand,
    previous: feeCharge({
      kind: 'utilities',
      sourceKey: 'fee:utilities:one_time',
      periodStart: null,
      periodEnd: null,
      amountPaisa: 777n,
    }),
  },
])(
  'FIN-004 / ACC-001: retry recovers the original authoritative fee invoice',
  async ({ input, previous }) => {
    const f = feeQueryFixture({ previous: [previous] });
    expect(await postAgreedFeePeriod(f.transaction, input, now)).toEqual({
      status: 'already_posted',
      chargeId: ids.charge,
      invoiceId: ids.invoice,
    });
    expect(f.writes).toHaveLength(0);
  },
);
it.each([command, oneTimeCommand])(
  'FIN-004: exhausted monthly/one-time periods create no additional charge',
  async (input) => {
    const f = feeQueryFixture();
    expect(await postAgreedFeePeriod(f.transaction, { ...input, periodIndex: 1 }, now)).toEqual({
      status: 'no_period',
      chargeId: null,
      invoiceId: null,
    });
    expect(f.writes).toHaveLength(0);
  },
);
it('PAY-008 / FIN-004: explicit zero fee creates no invoice, payment or receipt fiction', async () => {
  const f = feeQueryFixture({
    agreement: [
      feeAgreement({
        termsSnapshot: {
          ...feeTerms,
          fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 0 }],
        },
      }),
    ],
  });
  expect(await postAgreedFeePeriod(f.transaction, command, now)).toEqual({
    status: 'no_charge',
    chargeId: null,
    invoiceId: null,
  });
  expect(f.writes).toHaveLength(0);
});
it.each([undefined, 0, 123])(
  'FIN-004: manual partial fee %s must be explicit, never inferred from rent',
  async (amount) => {
    const feeBilling = feeTerms.policy.feeBilling;
    if (!feeBilling?.monthly) throw new Error('Missing test fee policy');
    const f = feeQueryFixture({
      stay: [rentStay({ expectedLeaveDate: '2028-02-15' })],
      agreement: [
        feeAgreement({
          termsSnapshot: {
            ...feeTerms,
            policy: {
              ...feeTerms.policy,
              feeBilling: {
                ...feeBilling,
                monthly: { ...feeBilling.monthly, proration: { kind: 'manual' } },
              },
            },
          },
        }),
      ],
    });
    const input = { ...command, ...(amount === undefined ? {} : { manualAmountPaisa: amount }) };
    if (amount === undefined) {
      await expect(postAgreedFeePeriod(f.transaction, input, now)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(f.writes).toHaveLength(0);
    } else {
      const result = await postAgreedFeePeriod(f.transaction, input, now);
      expect(result.status).toBe(amount === 0 ? 'no_charge' : 'posted');
      if (amount === 0) expect(f.writes).toHaveLength(0);
      else expect(f.writes[0]?.value).toMatchObject({ amountPaisa: BigInt(amount) });
    }
  },
);
it('FIN-004: unconfigured fee policy cannot skip the fee or create a guessed amount', async () => {
  const policy = { ...feeTerms.policy };
  delete policy.feeBilling;
  const f = feeQueryFixture({
    agreement: [feeAgreement({ termsSnapshot: { ...feeTerms, policy } })],
  });
  await expect(postAgreedFeePeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  });
  expect(f.writes).toHaveLength(0);
});
it('FIN-004: undisclosed fee selection cannot write a charge', async () => {
  const f = feeQueryFixture();
  await expect(
    postAgreedFeePeriod(
      f.transaction,
      { ...command, fee: { code: 'admission', cadence: 'monthly' } },
      now,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.writes).toHaveLength(0);
});
it.each([
  { kind: 'rent' as const },
  { amountPaisa: 1n },
  { periodStart: '2028-02-02' },
  { agreementId: randomUUID() },
  { sourceKey: 'another-source' },
])(
  'FIN-004: inconsistent or overlapping existing fee case %# requires an explicit adjustment',
  async (patch) => {
    const f = feeQueryFixture({ previous: [feeCharge(patch)] });
    await expect(postAgreedFeePeriod(f.transaction, command, now)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(f.writes).toHaveLength(0);
  },
);
it.each([command, oneTimeCommand])(
  'FIN-004: an effective-date amendment cannot silently rebill a prior fee',
  async (input) => {
    const f = feeQueryFixture({ agreement: [feeAgreement({ effectiveFrom: '2028-02-02' })] });
    await expect(postAgreedFeePeriod(f.transaction, input, now)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(f.writes).toHaveLength(0);
  },
);
it.each([residentCharges, residentLedger, residentInvoices, residentInvoiceCharges])(
  'FIN-004 / AUD-004: mandatory fee write failure propagates to the owning transaction',
  async (fail) => {
    const f = feeQueryFixture({ fail });
    await expect(postAgreedFeePeriod(f.transaction, command, now)).rejects.toThrow(
      'Posting write failed',
    );
  },
);
it.each([
  { actorUserId: 'invalid' },
  { periodIndex: -1 },
  { manualAmountPaisa: 0.5 },
  { amountPaisa: 1 },
  { sourceKey: 'injected' },
  { fee: { code: 'custom', cadence: 'monthly' } },
])(
  'SEC-003 / FIN-004: invalid/injected fee input %j is rejected before reads or writes',
  async (patch) => {
    const f = feeQueryFixture();
    await expect(
      postAgreedFeePeriod(f.transaction, { ...command, ...patch }, now),
    ).rejects.toThrow();
    expect(f.predicates).toHaveLength(0);
    expect(f.writes).toHaveLength(0);
  },
);
it('ACC-004: missing exact scoped Stay is unavailable without fee side effects', async () => {
  const f = feeQueryFixture({ stay: [] });
  await expect(postAgreedFeePeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(f.writes).toHaveLength(0);
});
it('SEC-003: an invalid server clock cannot partially post a fee', async () => {
  const f = feeQueryFixture();
  await expect(postAgreedFeePeriod(f.transaction, command, new Date('invalid'))).rejects.toThrow();
  expect(f.predicates).toHaveLength(0);
  expect(f.writes).toHaveLength(0);
});
