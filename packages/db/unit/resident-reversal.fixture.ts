import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { residentPayments, residentPaymentReversals, residentLedger } from '../src/schema/index.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import { fundCommandIds } from './resident-fund-command.fixture.js';
export const reversalIds = { ...fundCommandIds, receipt: randomUUID() };
export const reversalInput = {
  scope: {
    branchId: reversalIds.branch,
    stayId: reversalIds.stay,
    actorUserId: reversalIds.actor,
    actorRole: 'owner',
  },
  paymentId: reversalIds.payment,
  reversal: { reason: 'Owner correction of wrong recorded payment' },
};
export function reversalEntries() {
  return (['receivable', 'deposit', 'advance'] as const).map((account, index) => ({
    id: randomUUID(),
    branchId: reversalIds.branch,
    stayId: reversalIds.stay,
    paymentId: reversalIds.payment,
    fundingPaymentId: reversalIds.payment,
    account,
    side: 'credit',
    amountPaisa: index === 0 ? 1001n : index === 1 ? 1000n : 500n,
    invoiceId: account === 'receivable' ? reversalIds.invoice : null,
  }));
}
export function reversalFixture(
  options: {
    missing?: boolean;
    payment?: Record<string, unknown>;
    previous?: boolean;
    entries?: unknown[];
    fail?: unknown;
  } = {},
) {
  const rows = reversalRows(options);
  const writes: { table: unknown; value: unknown }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    predicates: { table: unknown; value: SQL }[] = [],
    limits: number[] = [];
  function select() {
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
      orderBy() {
        return query;
      },
      limit(value: number) {
        limits.push(value);
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  const tx = {
    select,
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          if (table === options.fail) throw Error('Required reversal write failed');
          writes.push({ table, value });
        },
      };
    },
  };
  return { tx: tx as unknown as PostingTransaction, writes, locks, predicates, limits };
}
export const reversalFundBalance = {
  deposit: {
    receivedPaisa: 1000,
    appliedToRentPaisa: 0,
    deductedPaisa: 0,
    refundedPaisa: 0,
    heldPaisa: 1000,
  },
  advance: { receivedPaisa: 500, appliedToRentPaisa: 0, refundedPaisa: 0, availablePaisa: 500 },
};

function reversalRows(options: {
  missing?: boolean;
  payment?: Record<string, unknown>;
  previous?: boolean;
  entries?: unknown[];
  fail?: unknown;
}) {
  const rows = new Map<unknown, unknown[]>([
    [
      residentPayments,
      options.missing
        ? []
        : [
            {
              id: reversalIds.payment,
              branchId: reversalIds.branch,
              stayId: reversalIds.stay,
              receiptId: reversalIds.receipt,
              amountPaisa: 2501n,
              ...options.payment,
            },
          ],
    ],
    [residentPaymentReversals, options.previous ? [{ id: randomUUID() }] : []],
    [residentLedger, options.entries ?? reversalEntries()],
  ]);
  return rows;
}
