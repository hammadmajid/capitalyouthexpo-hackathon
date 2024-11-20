import type { SQL } from 'drizzle-orm';
import {
  residentInvoices,
  residentInvoiceCharges,
  residentLedger,
  stays,
} from '../src/schema/index.js';
import type { readResidentInvoiceBalance } from '../src/resident-invoice-balance.js';
import { rentIds, rentTime } from './resident-rent.fixture.js';
export const invoiceReadInput = {
  branchId: rentIds.branch,
  stayId: rentIds.stay,
  invoiceId: rentIds.invoice,
  today: '2028-02-01',
};
export function invoiceRow(patch: Record<string, unknown> = {}) {
  return {
    id: rentIds.invoice,
    branchId: rentIds.branch,
    stayId: rentIds.stay,
    number: 'INV-FIXTURE',
    totalPaisa: 1800001n,
    dueDate: '2028-02-05',
    state: 'issued',
    issuedByUserId: rentIds.actor,
    issuedAt: rentTime,
    voidedByUserId: null,
    voidedAt: null,
    voidReason: null,
    ...patch,
  };
}
type Options = {
  stay?: unknown[];
  invoices?: unknown[];
  adjustments?: unknown[];
  allocations?: unknown[];
  grace?: unknown[];
  fail?: unknown;
};
export function invoiceReadFixture(options: Options = {}) {
  const rows = new Map<unknown, unknown[][]>([
    [stays, [options.stay ?? [{ id: rentIds.stay, branchId: rentIds.branch }]]],
    [residentInvoices, [options.invoices ?? [invoiceRow()]]],
    [residentInvoiceCharges, [options.grace ?? [{ graceDays: 0 }]]],
    [
      residentLedger,
      [
        options.adjustments ?? [{ debit: '0', credit: '0' }],
        options.allocations ?? [{ allocated: '0' }],
      ],
    ],
  ]);
  const predicates: { table: unknown; value: SQL }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    joins: { table: unknown; value: SQL }[] = [],
    limits: { table: unknown; value: number }[] = [];
  function select() {
    let table: unknown;
    const query = {
      $dynamic() {
        return query;
      },
      from(value: unknown) {
        table = value;
        return query;
      },
      innerJoin(value: unknown, condition: SQL) {
        joins.push({ table: value, value: condition });
        return query;
      },
      where(value: SQL) {
        predicates.push({ table, value });
        return query;
      },
      limit(value: number) {
        limits.push({ table, value });
        return query;
      },
      orderBy() {
        return query;
      },
      groupBy() {
        return query;
      },
      for(mode: string) {
        locks.push({ table, mode });
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        if (table === options.fail)
          return Promise.reject(new Error('Aggregate read failed')).then(resolve, reject);
        return Promise.resolve(rows.get(table)?.shift() ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  return {
    transaction: { select, selectDistinct: select } as unknown as Parameters<
      typeof readResidentInvoiceBalance
    >[0],
    predicates,
    locks,
    joins,
    limits,
  };
}
