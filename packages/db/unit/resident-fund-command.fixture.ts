import type { SQL } from 'drizzle-orm';
import {
  residentPayments,
  residentPaymentReversals,
  residentFundMovements,
} from '../src/schema/index.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import { paymentIds, paymentTime, paymentCommand } from './resident-payment.fixture.js';
export const fundCommandIds = { ...paymentIds, payment: paymentIds.file };
export const fundCommandTime = paymentTime;
export const fundMovementCommand = {
  scope: paymentCommand.scope,
  paymentId: fundCommandIds.payment,
  commandId: paymentIds.command,
  movement: {
    kind: 'deposit_apply',
    amountPaisa: 100,
    reason: 'Explicit agreed application',
    invoiceId: paymentIds.invoice,
  },
};
export const sourceFundBalance = {
  deposit: {
    receivedPaisa: 1001,
    appliedToRentPaisa: 0,
    deductedPaisa: 0,
    refundedPaisa: 0,
    heldPaisa: 1001,
  },
  advance: { receivedPaisa: 500, appliedToRentPaisa: 0, refundedPaisa: 0, availablePaisa: 500 },
};
export function fundCommandFixture(
  options: {
    missing?: boolean;
    payment?: Record<string, unknown>;
    previous?: boolean;
    reversed?: boolean;
    fail?: unknown;
  } = {},
) {
  const rows = fundRows(options);
  const writes: { table: unknown; value: unknown }[] = [],
    predicates: { table: unknown; value: SQL }[] = [],
    locks: { table: unknown; mode: string }[] = [];
  function select() {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
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
      limit() {
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
          if (table === options.fail) throw Error('Required fund write failed');
          writes.push({ table, value });
        },
      };
    },
  };
  return { tx: tx as unknown as PostingTransaction, writes, predicates, locks };
}

function fundRows(options: {
  missing?: boolean;
  payment?: Record<string, unknown>;
  previous?: boolean;
  reversed?: boolean;
  fail?: unknown;
}) {
  const rows = new Map<unknown, unknown[]>([
    [
      residentPayments,
      options.missing
        ? []
        : [
            {
              id: fundCommandIds.payment,
              branchId: paymentIds.branch,
              stayId: paymentIds.stay,
              ...options.payment,
            },
          ],
    ],
    [residentPaymentReversals, options.reversed ? [{ id: paymentIds.actor }] : []],
    [residentFundMovements, options.previous ? [{ id: paymentIds.actor }] : []],
  ]);
  return rows;
}
