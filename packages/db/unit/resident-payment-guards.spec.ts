import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  residentPayments,
  residentReceipts,
  residentLedger,
  hostelAuditLog,
} from '../src/schema/index.js';
import { readResidentInvoiceBalance } from '../src/resident-invoice-balance.js';
import { recordExternalResidentPayment } from '../src/resident-payment.js';
import {
  paymentFixture,
  paymentCommand as command,
  paymentIds as ids,
  paymentTime as now,
  paymentInvoice as invoice,
} from './resident-payment.fixture.js';
vi.mock('../src/resident-invoice-balance.js', () => ({ readResidentInvoiceBalance: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(invoice);
});
it('ACC-004: duplicate command is a conflict before proofs or allocations; API replay belongs to live authorized idempotency', async () => {
  const f = paymentFixture({ previous: true });
  await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
  expect(f.writes).toEqual([]);
  const row = f.predicates.find((value) => value.table === residentPayments);
  if (!row) throw new Error('Command scope missing');
  expect(new PgDialect().sqlToQuery(row.value).params).toEqual([
    ids.branch,
    ids.stay,
    'external_payment:' + ids.command,
  ]);
});
it.each([
  { state: 'voided' as const, outstandingPaisa: 0 },
  { state: 'paid' as const, outstandingPaisa: 0 },
  { state: 'issued' as const, outstandingPaisa: 1 },
])(
  'PAY-008: voided, paid or insufficient invoice %# cannot receive an excess allocation',
  async (patch) => {
    vi.mocked(readResidentInvoiceBalance).mockResolvedValue({ ...invoice, ...patch });
    const f = paymentFixture();
    await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(f.writes).toEqual([]);
  },
);
it('SEC-003: exact invoice reader denial propagates before posting', async () => {
  vi.mocked(readResidentInvoiceBalance).mockRejectedValue(
    new DomainError('NOT_FOUND', 404, 'Invoice unavailable'),
  );
  const f = paymentFixture();
  await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(f.writes).toEqual([]);
});
it.each(['organization', 'brand', 'branch'] as const)(
  'ACC-002: archived %s denies a new financial command',
  async (archived) => {
    const f = paymentFixture({ archived });
    await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toMatchObject({
      code: 'BRANCH_FORBIDDEN',
    });
    expect(f.writes).toEqual([]);
  },
);
it('ACC-004: missing exact Stay is unavailable', async () => {
  const f = paymentFixture({ missingStay: true });
  await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(f.writes).toEqual([]);
});
it.each([
  { stay: { id: randomUUID() } },
  { stay: { branchId: randomUUID() } },
  { resident: null },
  { resident: { id: randomUUID() } },
  { resident: { branchId: randomUUID() } },
])('SEC-003: corrupt financial party scope %# fails closed', async (options) => {
  const f = paymentFixture(options);
  await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
  expect(f.writes).toEqual([]);
});
it.each([residentPayments, residentReceipts, residentLedger, hostelAuditLog])(
  'AUD-004 / ACC-004: required financial write %# failure propagates to caller rollback',
  async (table) => {
    const f = paymentFixture({ fail: table });
    await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toThrow(
      'Required payment write failed',
    );
  },
);
it.each([
  { commandId: 'invalid' },
  { scope: { ...command.scope, actorRole: 'system' } },
  { scope: { ...command.scope, actorUserId: undefined } },
  { payment: { ...command.payment, amountPaisa: 0.1 } },
  { payment: { ...command.payment, depositPaisa: 1 } },
  { payment: { ...command.payment, state: 'paid' } },
])(
  'SEC-003: invalid or fabricated approved payment command %# fails before locks',
  async (patch) => {
    const f = paymentFixture();
    await expect(
      recordExternalResidentPayment(f.tx, { ...command, ...patch }, now),
    ).rejects.toThrow();
    expect(f.locks).toEqual([]);
    expect(f.writes).toEqual([]);
  },
);
it('SEC-003: invalid server clock fails before any financial scope lookup', async () => {
  const f = paymentFixture();
  await expect(
    recordExternalResidentPayment(f.tx, command, new Date(Number.NaN)),
  ).rejects.toThrow();
  expect(f.predicates).toEqual([]);
});

it('SEC-003: invalid stored receipt party data is an opaque producer failure before financial writes', async () => {
  const f = paymentFixture({ resident: { displayName: '' } });
  await expect(recordExternalResidentPayment(f.tx, command, now)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 500,
    message: 'Payment receipt data unavailable',
  });
  expect(f.writes).toEqual([]);
});
