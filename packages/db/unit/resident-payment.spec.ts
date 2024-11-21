import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError, residentReceiptSnapshotSchema } from '@hsm/contracts';
import {
  residentPayments,
  residentReceipts,
  residentLedger,
  hostelAuditLog,
  stays,
  residents,
} from '../src/schema/index.js';
import { readResidentInvoiceBalance } from '../src/resident-invoice-balance.js';
import { recordExternalResidentPayment } from '../src/resident-payment.js';
import {
  paymentFixture,
  paymentInvoice as invoice,
  paymentCommand as command,
  paymentIds as ids,
  paymentTime as now,
} from './resident-payment.fixture.js';
vi.mock('../src/resident-invoice-balance.js', () => ({ readResidentInvoiceBalance: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(invoice);
});
function write(f: ReturnType<typeof paymentFixture>, table: unknown) {
  const row = f.writes.find((value) => value.table === table);
  if (!row) throw new Error('Write missing');
  return row.value;
}
it('PAY-008/009 / AUD-004: exact approved human payment, receipt, ledger partition and audit retain every paisa', async () => {
  const f = paymentFixture();
  const result = await recordExternalResidentPayment(f.tx, command, now);
  expect(z.string().uuid().parse(result.paymentId)).toBe(result.paymentId);
  expect(result.receiptNumber).toBe('R-' + result.paymentId);
  expect(f.writes.map((row) => row.table)).toEqual([
    residentPayments,
    residentReceipts,
    residentLedger,
    hostelAuditLog,
  ]);
  expect(write(f, residentPayments)).toMatchObject({
    branchId: ids.branch,
    stayId: ids.stay,
    sourceKey: 'external_payment:' + ids.command,
    amountPaisa: 3000001n,
    approvedByUserId: ids.actor,
    proofFileId: null,
    transactionReference: null,
    approvedAt: now,
  });
  expectReceiptAndEntries(f, result.paymentId);
  expect(write(f, hostelAuditLog)).toMatchObject({
    actorUserId: ids.actor,
    actorRole: 'owner',
    targetId: result.paymentId,
    after: { paymentId: result.paymentId, receiptId: result.receiptId, amountPaisa: 3000001 },
  });
  expect(readResidentInvoiceBalance).toHaveBeenCalledWith(f.tx, {
    branchId: ids.branch,
    stayId: ids.stay,
    invoiceId: ids.invoice,
    today: '2028-02-01',
  });
  expect(f.locks).toContainEqual({ table: stays, mode: 'update' });
  expect(f.locks).toContainEqual({ table: residents, mode: 'share' });
});
it('PAY-008: approved partial payment remains one explicit credit without mutating an invoice Paid flag', async () => {
  const f = paymentFixture();
  await recordExternalResidentPayment(
    f.tx,
    {
      ...command,
      payment: {
        ...command.payment,
        amountPaisa: 1,
        allocations: [{ invoiceId: ids.invoice, amountPaisa: 1 }],
        depositPaisa: 0,
        advanceCreditPaisa: 0,
      },
    },
    now,
  );
  expect(write(f, residentLedger)).toMatchObject([{ account: 'receivable', amountPaisa: 1n }]);
  expect(f.writes).toHaveLength(4);
});
it.each([
  { account: 'deposit', depositPaisa: 1000, advanceCreditPaisa: 0 },
  { account: 'advance', depositPaisa: 0, advanceCreditPaisa: 1000 },
])(
  'RENT-005: deposit/advance $account is not rent revenue and never invents an invoice allocation',
  async (value) => {
    const f = paymentFixture();
    await recordExternalResidentPayment(
      f.tx,
      {
        ...command,
        payment: {
          ...command.payment,
          amountPaisa: 1000,
          allocations: [],
          depositPaisa: value.depositPaisa,
          advanceCreditPaisa: value.advanceCreditPaisa,
        },
      },
      now,
    );
    expect(write(f, residentLedger)).toMatchObject([
      { account: value.account, amountPaisa: 1000n },
    ]);
    expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
  },
);
it('PAY-008: authorized Manager attribution remains human and external references are preserved only in source/receipt', async () => {
  const f = paymentFixture();
  await recordExternalResidentPayment(
    f.tx,
    {
      ...command,
      scope: { ...command.scope, actorRole: 'manager' },
      payment: { ...command.payment, method: 'bank_transfer', transactionReference: 'BANK-1' },
    },
    now,
  );
  expect(write(f, residentPayments)).toMatchObject({
    method: 'bank_transfer',
    transactionReference: 'BANK-1',
    approvedByUserId: ids.actor,
  });
  expect(write(f, hostelAuditLog)).toMatchObject({ actorRole: 'manager' });
  expect(write(f, hostelAuditLog)).not.toHaveProperty('transactionReference');
});
it('SEC-003: proof authorization must run inside this exact transaction and scope before financial writes', async () => {
  const f = paymentFixture(),
    validate = vi.fn(async () => {
      expect(f.writes).toEqual([]);
    });
  await recordExternalResidentPayment(
    f.tx,
    { ...command, payment: { ...command.payment, proofFileId: ids.file } },
    now,
    validate,
  );
  expect(validate).toHaveBeenCalledWith(f.tx, command.scope, ids.file);
  expect(write(f, residentPayments)).toMatchObject({ proofFileId: ids.file });
});
it('SEC-003: missing proof authorizer fails closed instead of silently approving an attachment', async () => {
  const f = paymentFixture();
  await expect(
    recordExternalResidentPayment(
      f.tx,
      { ...command, payment: { ...command.payment, proofFileId: ids.file } },
      now,
    ),
  ).rejects.toMatchObject({ code: 'INTERNAL', status: 503 });
  expect(f.writes).toEqual([]);
});
it('SEC-003: rejected proof authorization has no approved payment, receipt, ledger or audit', async () => {
  const f = paymentFixture(),
    validate = vi.fn(async () => {
      throw new DomainError('FORBIDDEN', 403, 'Proof unavailable');
    });
  await expect(
    recordExternalResidentPayment(
      f.tx,
      { ...command, payment: { ...command.payment, proofFileId: ids.file } },
      now,
      validate,
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.writes).toEqual([]);
});

function expectReceiptAndEntries(f: ReturnType<typeof paymentFixture>, paymentId: string) {
  const receipt = z
    .object({ snapshot: residentReceiptSnapshotSchema })
    .parse(write(f, residentReceipts));
  expect(receipt.snapshot).toMatchObject({
    paymentId: paymentId,
    residentName: 'Resident name',
    hostelName: 'Hostel name',
    branchName: 'Branch name',
    amountPaisa: 3000001,
    allocations: [{ invoiceId: ids.invoice, invoiceNumber: 'INV-1', amountPaisa: 1800001 }],
    distribution: { allocatedPaisa: 1800001, depositPaisa: 1000000, advanceCreditPaisa: 200000 },
  });
  expect(receipt.snapshot).not.toHaveProperty('organizationId');
  expect(write(f, residentLedger)).toMatchObject([
    {
      account: 'receivable',
      side: 'credit',
      invoiceId: ids.invoice,
      amountPaisa: 1800001n,
      paymentId: paymentId,
      fundingPaymentId: paymentId,
    },
    { account: 'deposit', amountPaisa: 1000000n },
    { account: 'advance', amountPaisa: 200000n },
  ]);
}

it('FIN-001: maximum safe integer payment partition remains exact through JSON receipt and bigint ledger', async () => {
  const f = paymentFixture(),
    amount = Number.MAX_SAFE_INTEGER;
  await recordExternalResidentPayment(
    f.tx,
    {
      ...command,
      payment: {
        ...command.payment,
        amountPaisa: amount,
        allocations: [],
        depositPaisa: amount - 1,
        advanceCreditPaisa: 1,
      },
    },
    now,
  );
  expect(write(f, residentPayments)).toMatchObject({ amountPaisa: BigInt(amount) });
  expect(write(f, residentLedger)).toMatchObject([
    { account: 'deposit', amountPaisa: BigInt(amount) - 1n },
    { account: 'advance', amountPaisa: 1n },
  ]);
  const receipt = z
    .object({ snapshot: residentReceiptSnapshotSchema })
    .parse(write(f, residentReceipts));
  expect(receipt.snapshot.distribution).toEqual({
    allocatedPaisa: 0,
    depositPaisa: amount - 1,
    advanceCreditPaisa: 1,
  });
});
