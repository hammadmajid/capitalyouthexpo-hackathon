import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { stays, residentReceipts, residentPaymentReversals } from '../src/schema/index.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
export const receiptIds = {
  branchId: randomUUID(),
  stayId: randomUUID(),
  receiptId: randomUUID(),
  paymentId: randomUUID(),
  reversalId: randomUUID(),
};
export const receiptScope = {
  branchId: receiptIds.branchId,
  stayId: receiptIds.stayId,
  receiptId: receiptIds.receiptId,
};
export const receiptTime = new Date('2028-02-01T06:00:00.000Z');
export function receiptRows() {
  const { branchId, stayId, paymentId, receiptId } = receiptIds;
  return {
    stay: { id: stayId, branchId },
    receipt: {
      id: receiptId,
      branchId,
      stayId,
      paymentId,
      number: 'R-1',
      issuedAt: receiptTime,
      snapshot: {
        version: 1,
        currency: 'PKR',
        paymentId,
        branchId,
        stayId,
        residentName: 'Historical resident',
        hostelName: 'Historical hostel',
        branchName: 'Historical branch',
        amountPaisa: 1001,
        method: 'cash',
        transactionReference: null,
        paidOn: '2028-02-01',
        approvedAt: receiptTime.toISOString(),
        allocations: [],
        distribution: { allocatedPaisa: 0, depositPaisa: 1000, advanceCreditPaisa: 1 },
      },
    },
    payment: {
      id: paymentId,
      branchId,
      stayId,
      amountPaisa: 1001n,
      method: 'cash',
      transactionReference: null,
      paidOn: '2028-02-01',
      approvedAt: receiptTime,
      proofFileId: randomUUID(),
      note: 'Private staff note',
    },
    reversal: { id: receiptIds.reversalId, branchId, stayId, paymentId },
  };
}
export function receiptFixture(
  options: {
    stay?: Record<string, unknown> | null;
    receipt?: Record<string, unknown>;
    payment?: Record<string, unknown>;
    missing?: boolean;
    duplicate?: boolean;
    reversals?: Record<string, unknown>[];
  } = {},
) {
  const rows = receiptRows();
  const record = {
    receipt: { ...rows.receipt, ...options.receipt },
    payment: { ...rows.payment, ...options.payment },
  };
  const values = new Map<unknown, unknown[]>([
    [stays, options.stay === null ? [] : [{ ...rows.stay, ...options.stay }]],
    [residentReceipts, options.missing ? [] : options.duplicate ? [record, record] : [record]],
    [residentPaymentReversals, options.reversals ?? []],
  ]);
  const locks: { table: unknown; mode: string }[] = [],
    predicates: { table: unknown; value: SQL }[] = [],
    limits: number[] = [];
  const tx = {
    select() {
      let table: unknown;
      const query = {
        from(value: unknown) {
          table = value;
          return query;
        },
        innerJoin() {
          return query;
        },
        where(value: SQL) {
          predicates.push({ table, value });
          return query;
        },
        for(mode: string) {
          locks.push({ table, mode });
          return query;
        },
        limit(value: number) {
          limits.push(value);
          return query;
        },
        then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve(values.get(table) ?? []).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { tx: tx as unknown as PostingTransaction, locks, predicates, limits };
}
