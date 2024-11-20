import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  residentPayments,
  residentFundMovements,
  residentLedger,
  hostelAuditLog,
} from '../src/schema/index.js';
import { lockPaymentParty } from '../src/resident-payment-context.js';
import { readResidentFundBalance } from '../src/resident-fund-balance.js';
import { readResidentInvoiceBalance } from '../src/resident-invoice-balance.js';
import { recordResidentFundMovement } from '../src/resident-fund-movement.js';
import { paymentInvoice } from './resident-payment.fixture.js';
import {
  fundCommandFixture as fixture,
  fundMovementCommand as command,
  fundCommandIds as ids,
  fundCommandTime as now,
  sourceFundBalance as balance,
} from './resident-fund-command.fixture.js';
vi.mock('../src/resident-payment-context.js', async (original) => ({
  ...(await original<typeof import('../src/resident-payment-context.js')>()),
  lockPaymentParty: vi.fn(),
}));
vi.mock('../src/resident-fund-balance.js', () => ({ readResidentFundBalance: vi.fn() }));
vi.mock('../src/resident-invoice-balance.js', () => ({ readResidentInvoiceBalance: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockPaymentParty).mockResolvedValue({
    organizationId: ids.organization,
    residentName: 'Resident',
    hostelName: 'Hostel',
    branchName: 'Branch',
  });
  vi.mocked(readResidentFundBalance).mockResolvedValue(balance);
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(paymentInvoice);
});
it.each([
  'deposit_apply',
  'advance_apply',
  'deposit_deduct',
  'deposit_refund',
  'advance_refund',
] as const)(
  'RENT-005 / AUD-004: %s preserves funding origin and appends exact debit/optional invoice credit/audit',
  async (kind) => {
    const f = fixture(),
      applied = kind === 'deposit_apply' || kind === 'advance_apply',
      movement = applied
        ? { ...command.movement, kind }
        : {
            kind,
            amountPaisa: 100,
            reason: 'External hostel settlement',
            externalReference: 'HOSTEL-1',
          };
    const result = await recordResidentFundMovement(f.tx, { ...command, movement }, now);
    expect(result).toMatchObject({ paymentId: ids.payment, kind, amountPaisa: 100 });
    expect(f.writes.map((row) => row.table)).toEqual([
      residentFundMovements,
      residentLedger,
      hostelAuditLog,
    ]);
    expect(fundWrite(f, 0)).toMatchObject({
      id: result.movementId,
      paymentId: ids.payment,
      sourceKey: 'fund_movement:' + ids.command,
      kind,
      amountPaisa: 100n,
      invoiceId: applied ? ids.invoice : null,
      externalReference: applied ? null : 'HOSTEL-1',
      postedByUserId: ids.actor,
    });
    const entries = fundWrite(f, 1);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: kind.startsWith('advance_') ? 'advance' : 'deposit',
          side: 'debit',
          amountPaisa: 100n,
          fundingPaymentId: ids.payment,
          fundMovementId: result.movementId,
        }),
      ]),
    );
    expect(entries).toHaveLength(applied ? 2 : 1);
    if (applied) {
      expect(entries).toMatchObject([
        {},
        { account: 'receivable', side: 'credit', invoiceId: ids.invoice, amountPaisa: 100n },
      ]);
      expect(readResidentInvoiceBalance).toHaveBeenCalled();
    } else expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
    expect(readResidentFundBalance).toHaveBeenCalledWith(f.tx, {
      branchId: ids.branch,
      stayId: ids.stay,
      paymentId: ids.payment,
    });
    expect(fundWrite(f, 2)).toMatchObject({
      actorUserId: ids.actor,
      actorRole: 'owner',
      action: 'resident.fund.recorded',
      targetId: result.movementId,
    });
  },
);
it('SEC-003: original funding payment and command source lookup bind exact branch/Stay under write lock', async () => {
  const f = fixture();
  await recordResidentFundMovement(f.tx, command, now);
  expect(f.locks).toEqual([{ table: residentPayments, mode: 'update' }]);
  const dialect = new PgDialect();
  expect(f.predicates.map((row) => dialect.sqlToQuery(row.value).params)).toEqual([
    [ids.branch, ids.stay, ids.payment],
    [ids.branch, ids.stay, ids.payment],
    [ids.branch, ids.stay, 'fund_movement:' + ids.command],
  ]);
});
it.each([
  { missing: true },
  { payment: { id: randomUUID() } },
  { payment: { branchId: randomUUID() } },
  { payment: { stayId: randomUUID() } },
  { previous: true },
  { reversed: true },
])(
  'SEC-003 / ACC-004: missing/corrupt/reversed/duplicate source %# has no fund writes',
  async (options) => {
    const f = fixture(options);
    await expect(recordResidentFundMovement(f.tx, command, now)).rejects.toThrow();
    expect(f.writes).toEqual([]);
    expect(readResidentFundBalance).not.toHaveBeenCalled();
  },
);
it.each(['deposit_apply', 'advance_apply'] as const)(
  'RENT-005: %s cannot consume another payment available funds',
  async (kind) => {
    const f = fixture();
    await expect(
      recordResidentFundMovement(
        f.tx,
        { ...command, movement: { ...command.movement, kind, amountPaisa: 1002 } },
        now,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(f.writes).toEqual([]);
    expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
  },
);
it.each([
  { state: 'voided' as const, outstandingPaisa: 0 },
  { state: 'issued' as const, outstandingPaisa: 99 },
])('PAY-008: fund application cannot exceed exact non-void invoice %#', async (patch) => {
  const f = fixture();
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue({ ...paymentInvoice, ...patch });
  await expect(recordResidentFundMovement(f.tx, command, now)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(f.writes).toEqual([]);
});
it('FIN-001: server Karachi date follows local midnight across UTC boundary', async () => {
  const f = fixture();
  await recordResidentFundMovement(f.tx, command, new Date('2028-02-01T20:00:00Z'));
  expect(readResidentInvoiceBalance).toHaveBeenCalledWith(f.tx, {
    branchId: ids.branch,
    stayId: ids.stay,
    invoiceId: ids.invoice,
    today: '2028-02-02',
  });
});
it.each([residentFundMovements, residentLedger, hostelAuditLog])(
  'AUD-004 / ACC-004: required fund write failure %# propagates for transaction rollback',
  async (table) => {
    await expect(
      recordResidentFundMovement(fixture({ fail: table }).tx, command, now),
    ).rejects.toThrow('Required fund write failed');
  },
);
it('SEC-003: required scoped invoice/fund reader denial propagates before fund writes', async () => {
  const f = fixture();
  vi.mocked(readResidentInvoiceBalance).mockRejectedValue(
    new DomainError('NOT_FOUND', 404, 'Invoice unavailable'),
  );
  await expect(recordResidentFundMovement(f.tx, command, now)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(f.writes).toEqual([]);
});
it.each([
  { commandId: 'bad' },
  { paymentId: 'bad' },
  { scope: { ...command.scope, actorRole: 'system' } },
  { movement: { ...command.movement, amountPaisa: 0.1 } },
  {
    movement: {
      kind: 'deposit_refund',
      amountPaisa: 100,
      reason: 'Paid externally',
      invoiceId: ids.invoice,
    },
  },
  { movement: { ...command.movement, paid: true } },
])('SEC-003: malformed/injected fund command %# fails before locks', async (patch) => {
  const f = fixture();
  await expect(recordResidentFundMovement(f.tx, { ...command, ...patch }, now)).rejects.toThrow();
  expect(lockPaymentParty).not.toHaveBeenCalled();
  expect(f.writes).toEqual([]);
});
it('SEC-003: invalid server clock has no financial side effect', async () => {
  const f = fixture();
  await expect(recordResidentFundMovement(f.tx, command, new Date(Number.NaN))).rejects.toThrow();
  expect(lockPaymentParty).not.toHaveBeenCalled();
});
it('RENT-005: cash refund without optional external reference remains explicit human recorded settlement', async () => {
  const f = fixture();
  await recordResidentFundMovement(
    f.tx,
    {
      ...command,
      movement: { kind: 'deposit_refund', amountPaisa: 100, reason: 'Cash refund paid directly' },
    },
    now,
  );
  expect(fundWrite(f, 0)).toMatchObject({ externalReference: null, invoiceId: null });
});

function fundWrite(f: ReturnType<typeof fixture>, index: number) {
  const row = f.writes.at(index);
  if (!row) throw Error('Required fund write missing');
  return row.value;
}

it('RENT-005: explicit absent optional external reference normalizes to persisted null', async () => {
  const f = fixture();
  await recordResidentFundMovement(
    f.tx,
    {
      ...command,
      movement: {
        kind: 'advance_refund',
        amountPaisa: 100,
        reason: 'Cash refund paid directly',
        externalReference: undefined,
      },
    },
    now,
  );
  expect(fundWrite(f, 0)).toMatchObject({ externalReference: null });
});
