import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  stays,
  residentCharges,
  residentInvoices,
  residentInvoiceCharges,
  residentLedger,
} from '../src/schema/index.js';
import { postAgreedRentPeriod } from '../src/resident-rent.js';
import {
  rentIds as ids,
  rentTime as now,
  rentTerms as terms,
  rentCommand as command,
  rentStay,
  rentAgreement,
  rentCharge,
  rentQueryFixture,
} from './resident-rent.fixture.js';
it('RENT-003 / FIN-001: canonical rent writes exact bigint charge, debit, issued invoice and scoped link in the caller transaction', async () => {
  const f = rentQueryFixture(),
    result = await postAgreedRentPeriod(f.transaction, command, now);
  expect(result.status).toBe('posted');
  expect(f.locks).toEqual([{ table: stays, mode: 'update' }]);
  expect(f.writes.map((row) => row.table)).toEqual([
    residentCharges,
    residentLedger,
    residentInvoices,
    residentInvoiceCharges,
  ]);
  expect(f.writes[0]?.value).toMatchObject({
    id: result.chargeId,
    branchId: ids.branch,
    stayId: ids.stay,
    agreementId: ids.agreement,
    kind: 'rent',
    quantity: 1,
    sourceKey: 'rent:2028-02-01:2028-03-01',
    amountPaisa: 1800001n,
    postedByUserId: ids.actor,
  });
  expect(f.writes[1]?.value).toMatchObject({
    chargeId: result.chargeId,
    account: 'receivable',
    side: 'debit',
    amountPaisa: 1800001n,
  });
  expect(f.writes[2]?.value).toMatchObject({
    id: result.invoiceId,
    totalPaisa: 1800001n,
    dueDate: '2028-02-05',
    state: 'issued',
  });
  expect(f.writes[3]?.value).toMatchObject({
    invoiceId: result.invoiceId,
    chargeId: result.chargeId,
  });
  const predicate = f.predicates[0];
  if (!predicate) throw new Error('Missing exact Stay scope');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([ids.branch, ids.stay]);
});
it('RENT-003 / ACC-001: repeated period recovers the authoritative existing invoice without duplicate writes', async () => {
  const f = rentQueryFixture({ previous: [rentCharge()] });
  expect(await postAgreedRentPeriod(f.transaction, command, now)).toEqual({
    status: 'already_posted',
    chargeId: ids.charge,
    invoiceId: ids.invoice,
  });
  expect(f.writes).toHaveLength(0);
});
it('RENT-003: a finite agreement does not create charges beyond its end', async () => {
  const f = rentQueryFixture();
  expect(await postAgreedRentPeriod(f.transaction, { ...command, periodIndex: 1 }, now)).toEqual({
    status: 'no_period',
    chargeId: null,
    invoiceId: null,
  });
  expect(f.writes).toHaveLength(0);
});
it('PAY-008: explicit zero rent produces no_charge, never a paid invoice or invented payment', async () => {
  const f = rentQueryFixture({
    agreement: [
      rentAgreement({ rentAmountPaisa: 0n, termsSnapshot: { ...terms, rentAmountPaisa: 0 } }),
    ],
  });
  expect(await postAgreedRentPeriod(f.transaction, command, now)).toEqual({
    status: 'no_charge',
    chargeId: null,
    invoiceId: null,
  });
  expect(f.writes).toHaveLength(0);
});
it.each([undefined, 12345, 0])(
  'RENT-003: manual partial amount %s is unresolved or explicitly posted without guessed proration',
  async (amount) => {
    const f = rentQueryFixture({
      stay: [rentStay({ expectedLeaveDate: '2028-02-15' })],
      agreement: [
        rentAgreement({
          termsSnapshot: { ...terms, policy: { ...terms.policy, proration: { kind: 'manual' } } },
        }),
      ],
    });
    const input = { ...command, ...(amount === undefined ? {} : { manualAmountPaisa: amount }) };
    if (amount === undefined) {
      await expect(postAgreedRentPeriod(f.transaction, input, now)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(f.writes).toHaveLength(0);
    } else {
      const result = await postAgreedRentPeriod(f.transaction, input, now);
      expect(result.status).toBe(amount === 0 ? 'no_charge' : 'posted');
      if (amount !== 0) expect(f.writes[0]?.value).toMatchObject({ amountPaisa: BigInt(amount) });
    }
  },
);
it.each(['completed', 'cancelled_before_checkin', 'terminated', 'abandoned'] as const)(
  'STAY-004: %s cannot receive a new rent posting',
  async (state) => {
    const f = rentQueryFixture({ stay: [rentStay({ state })] });
    await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(f.writes).toHaveLength(0);
  },
);
it('STAY-004: a closed Stay cannot post despite an inconsistent active state', async () => {
  const f = rentQueryFixture({ stay: [rentStay({ state: 'active', closedAt: now })] });
  await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it('ACC-004: missing Stay is opaque and has no financial side effects', async () => {
  const f = rentQueryFixture({ stay: [] });
  await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(f.writes).toHaveLength(0);
});
it.each([{ id: randomUUID() }, { branchId: randomUUID() }])(
  'ACC-004: inconsistent selected Stay scope rejects %j',
  async (patch) => {
    const f = rentQueryFixture({ stay: [rentStay(patch)] });
    await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
it.each([{ agreement: [] }, { agreement: [rentAgreement({ id: randomUUID() })] }])(
  'RENT-003: absent or superseded agreement requires explicit current agreement',
  async ({ agreement }) => {
    const f = rentQueryFixture({ agreement });
    await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  },
);
it.each([
  { branchId: randomUUID() },
  { stayId: randomUUID() },
  { termsSnapshot: {} },
  { policyVersionId: randomUUID() },
  { rentAmountPaisa: 1n },
  { depositPaisa: 1n },
])('ACC-004 / RENT-003: inconsistent immutable agreement is not reinterpreted', async (patch) => {
  const f = rentQueryFixture({ agreement: [rentAgreement(patch)] });
  await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
  expect(f.writes).toHaveLength(0);
});
it('RENT-003: a mid-period amendment cannot silently regenerate prior agreed rent', async () => {
  const f = rentQueryFixture({ agreement: [rentAgreement({ effectiveFrom: '2028-02-15' })] });
  await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it.each([
  { branchId: randomUUID() },
  { stayId: randomUUID() },
  { agreementId: randomUUID() },
  { sourceKey: 'another-source' },
  { periodStart: '2028-01-31' },
  { periodEnd: '2028-03-02' },
  { amountPaisa: 1n },
])('RENT-003 / FIN-001: overlap or changed posted facts require an adjustment', async (patch) => {
  const f = rentQueryFixture({ previous: [rentCharge(patch)] });
  await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(f.writes).toHaveLength(0);
});
it('RENT-003: multiple overlapping prior charges are not healed by deleting or rewriting history', async () => {
  const f = rentQueryFixture({ previous: [rentCharge(), rentCharge({ id: randomUUID() })] });
  await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(f.writes).toHaveLength(0);
});
it.each([
  { invoices: [] },
  { invoices: [{ invoiceId: ids.invoice }, { invoiceId: randomUUID() }] },
])(
  'FIN-001: incomplete or duplicated existing invoice linkage fails closed',
  async ({ invoices }) => {
    const f = rentQueryFixture({ previous: [rentCharge()], invoices });
    await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    expect(f.writes).toHaveLength(0);
  },
);
it.each([residentCharges, residentLedger, residentInvoices, residentInvoiceCharges])(
  'FIN-001: mandatory write failure propagates to the owning transaction',
  async (fail) => {
    const f = rentQueryFixture({ fail });
    await expect(postAgreedRentPeriod(f.transaction, command, now)).rejects.toThrow(
      'Posting write failed',
    );
  },
);
it.each([
  { ...command, actorUserId: 'invalid' },
  { ...command, periodIndex: -1 },
  { ...command, manualAmountPaisa: 0.5 },
  { ...command, amountPaisa: 1 },
])('SEC-003: invalid or authoritative-amount overrides reject before queries', async (input) => {
  const f = rentQueryFixture();
  await expect(postAgreedRentPeriod(f.transaction, input, now)).rejects.toThrow();
  expect(f.predicates).toHaveLength(0);
  expect(f.writes).toHaveLength(0);
});
it('SEC-003: invalid server clock cannot create a partial financial posting', async () => {
  const f = rentQueryFixture();
  await expect(postAgreedRentPeriod(f.transaction, command, new Date('invalid'))).rejects.toThrow();
  expect(f.writes).toHaveLength(0);
});
