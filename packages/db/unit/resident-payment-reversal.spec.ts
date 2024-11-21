import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  residentPaymentReversals,
  residentPayments,
  residentLedger,
  hostelAuditLog,
} from '../src/schema/index.js';
import { lockPaymentParty } from '../src/resident-payment-context.js';
import { readResidentFundBalance } from '../src/resident-fund-balance.js';
import { reverseResidentPayment } from '../src/resident-payment-reversal.js';
import {
  reversalFixture as fixture,
  reversalInput as input,
  reversalIds as ids,
  reversalEntries,
  reversalFundBalance as balance,
} from './resident-reversal.fixture.js';
const now = new Date('2028-02-01T06:00:00Z');
vi.mock('../src/resident-payment-context.js', async (original) => ({
  ...(await original<typeof import('../src/resident-payment-context.js')>()),
  lockPaymentParty: vi.fn(),
}));
vi.mock('../src/resident-fund-balance.js', () => ({ readResidentFundBalance: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockPaymentParty).mockResolvedValue({
    organizationId: ids.organization,
    residentName: 'Resident',
    hostelName: 'Hostel',
    branchName: 'Branch',
  });
  vi.mocked(readResidentFundBalance).mockResolvedValue(balance);
});
it('Q14 / PAY-008 / AUD-004: actual human Owner reversal appends exact opposite original entries and audit, retaining original receipt', async () => {
  const entries = reversalEntries(),
    f = fixture({ entries }),
    result = await reverseResidentPayment(f.tx, input, now);
  expect(result).toMatchObject({ paymentId: ids.payment, receiptId: ids.receipt });
  expect(f.writes.map((row) => row.table)).toEqual([
    residentPaymentReversals,
    residentLedger,
    hostelAuditLog,
  ]);
  expect(f.writes.at(0)?.value).toMatchObject({
    id: result.reversalId,
    paymentId: ids.payment,
    reason: input.reversal.reason,
    approvedByUserId: ids.actor,
    approvedAt: now,
  });
  expect(f.writes.at(1)?.value).toEqual(
    entries.map((row) =>
      expect.objectContaining({
        branchId: ids.branch,
        stayId: ids.stay,
        account: row.account,
        side: 'debit',
        amountPaisa: row.amountPaisa,
        invoiceId: row.invoiceId,
        paymentReversalId: result.reversalId,
        fundingPaymentId: ids.payment,
        reversedEntryId: row.id,
        postedAt: now,
      }),
    ),
  );
  expect(f.writes.at(2)?.value).toMatchObject({
    actorUserId: ids.actor,
    actorRole: 'owner',
    action: 'resident.payment.reversed',
    targetId: result.reversalId,
  });
  expect(f.locks).toEqual([{ table: residentPayments, mode: 'update' }]);
  expect(f.limits).toEqual([1, 103]);
  expect(readResidentFundBalance).toHaveBeenCalledWith(f.tx, {
    branchId: ids.branch,
    stayId: ids.stay,
    paymentId: ids.payment,
  });
  const dialect = new PgDialect();
  expect(f.predicates.map((row) => dialect.sqlToQuery(row.value).params)).toEqual([
    [ids.payment, ids.branch, ids.stay],
    [ids.branch, ids.stay, ids.payment],
    [ids.branch, ids.stay, ids.payment],
  ]);
});
it.each([
  { missing: true },
  { previous: true },
  { payment: { id: randomUUID() } },
  { payment: { branchId: randomUUID() } },
  { payment: { stayId: randomUUID() } },
  { payment: { receiptId: 'bad' } },
  { payment: { amountPaisa: '2501' } },
  { payment: { amountPaisa: 0n } },
  { payment: { amountPaisa: 9007199254740992n } },
])(
  'SEC-003: absent/reversed/corrupt approved payment %# has no reversal write',
  async (options) => {
    const f = fixture(options);
    await expect(reverseResidentPayment(f.tx, input, now)).rejects.toThrow();
    expect(f.writes).toEqual([]);
    expect(readResidentFundBalance).not.toHaveBeenCalled();
  },
);
it.each([
  { field: 'id', value: 'bad' },
  { field: 'branchId', value: randomUUID() },
  { field: 'stayId', value: randomUUID() },
  { field: 'paymentId', value: randomUUID() },
  { field: 'fundingPaymentId', value: randomUUID() },
  { field: 'side', value: 'debit' },
  { field: 'amountPaisa', value: 0n },
  { field: 'account', value: 'unknown' },
  { field: 'invoiceId', value: null },
])(
  'SEC-003 / FIN-001: malformed or mismatched original posting $field cannot be reversed',
  async ({ field, value }) => {
    const entries = reversalEntries(),
      first = entries[0];
    if (!first) throw Error('Original missing');
    const f = fixture({ entries: [{ ...first, [field]: value }, ...entries.slice(1)] });
    await expect(reverseResidentPayment(f.tx, input, now)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    });
    expect(f.writes).toEqual([]);
  },
);
it.each([
  { entries: [] },
  { entries: Array.from({ length: 103 }, () => reversalEntries()[0]) },
  { payment: { amountPaisa: 2500n } },
])(
  'FIN-001: absent/unbounded/nonconserving original distribution %# fails closed',
  async (options) => {
    const f = fixture(options);
    await expect(reverseResidentPayment(f.tx, input, now)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    });
    expect(f.writes).toEqual([]);
  },
);
it.each(['deposit', 'advance'] as const)(
  'RENT-005: spent %s must be explicitly resolved before full payment reversal',
  async (account) => {
    const f = fixture();
    vi.mocked(readResidentFundBalance).mockResolvedValue({
      ...balance,
      ...(account === 'deposit'
        ? { deposit: { ...balance.deposit, heldPaisa: 999 } }
        : { advance: { ...balance.advance, availablePaisa: 499 } }),
    });
    await expect(reverseResidentPayment(f.tx, input, now)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Resolve spent deposit or advance before reversing payment',
    });
    expect(f.writes).toEqual([]);
  },
);
it.each([residentPaymentReversals, residentLedger, hostelAuditLog])(
  'AUD-004 / ACC-004: required reversal write %# failure propagates to caller rollback',
  async (fail) => {
    await expect(reverseResidentPayment(fixture({ fail }).tx, input, now)).rejects.toThrow(
      'Required reversal write failed',
    );
  },
);
it.each([
  { scope: { ...input.scope, actorRole: 'manager' } },
  { scope: { ...input.scope, actorRole: 'system' } },
  { paymentId: 'bad' },
  { reversal: { reason: '' } },
  { reversal: { reason: 'Correction', eraseReceipt: true } },
])('Q14 / SEC-003: unauthorized/injected reversal %# fails before locks', async (patch) => {
  const f = fixture();
  await expect(reverseResidentPayment(f.tx, { ...input, ...patch }, now)).rejects.toThrow();
  expect(lockPaymentParty).not.toHaveBeenCalled();
  expect(f.writes).toEqual([]);
});
it('SEC-003: invalid server clock cannot start reversal scope access', async () => {
  await expect(reverseResidentPayment(fixture().tx, input, new Date(Number.NaN))).rejects.toThrow();
  expect(lockPaymentParty).not.toHaveBeenCalled();
});
it('PAY-008: invoice-only reversal has no deposit/advance requirement and retains exact original invoice debit', async () => {
  const entries = reversalEntries().slice(0, 1),
    f = fixture({ entries, payment: { amountPaisa: 1001n } });
  expect(await reverseResidentPayment(f.tx, input, now)).toMatchObject({
    paymentId: ids.payment,
    receiptId: ids.receipt,
  });
  expect(f.writes.at(1)?.value).toHaveLength(1);
});
