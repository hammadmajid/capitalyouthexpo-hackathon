import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import {
  branches,
  brands,
  organizations,
  stays,
  residents,
  residentPayments,
} from '../src/schema/index.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
export const paymentIds = {
  branch: randomUUID(),
  stay: randomUUID(),
  resident: randomUUID(),
  actor: randomUUID(),
  organization: randomUUID(),
  brand: randomUUID(),
  command: randomUUID(),
  invoice: randomUUID(),
  file: randomUUID(),
};
export const paymentTime = new Date('2028-02-01T06:00:00Z');
export const paymentCommand = {
  scope: {
    branchId: paymentIds.branch,
    stayId: paymentIds.stay,
    actorUserId: paymentIds.actor,
    actorRole: 'owner',
  },
  commandId: paymentIds.command,
  payment: {
    amountPaisa: 3000001,
    method: 'cash',
    paidOn: '2028-02-01',
    note: 'Received directly by hostel',
    allocations: [{ invoiceId: paymentIds.invoice, amountPaisa: 1800001 }],
    depositPaisa: 1000000,
    advanceCreditPaisa: 200000,
  },
};
export type PaymentFixtureOptions = {
  archived?: 'organization' | 'brand' | 'branch';
  missingBranch?: boolean;
  missingStay?: boolean;
  stay?: Record<string, unknown>;
  resident?: Record<string, unknown> | null;
  previous?: boolean;
  fail?: unknown;
};
export function paymentFixture(options: PaymentFixtureOptions = {}) {
  const rows = new Map<unknown, unknown[]>([
    ...hierarchyRows(options),
    ...residentRows(options),
    [residentPayments, options.previous ? [{ id: randomUUID() }] : []],
  ]);
  const writes: { table: unknown; value: unknown }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    predicates: { table: unknown; value: SQL }[] = [];
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
      limit() {
        return query;
      },
      for(mode: string) {
        locks.push({ table, mode });
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
          if (table === options.fail) throw new Error('Required payment write failed');
          writes.push({ table, value });
        },
      };
    },
  };
  return { tx: tx as unknown as PostingTransaction, writes, locks, predicates };
}

function hierarchyRows(options: PaymentFixtureOptions): [unknown, unknown[]][] {
  return [
    [
      branches,
      options.missingBranch
        ? []
        : [
            {
              id: paymentIds.branch,
              organizationId: paymentIds.organization,
              brandId: paymentIds.brand,
              name: 'Branch name',
              archivedAt: options.archived === 'branch' ? paymentTime : null,
            },
          ],
    ],
    [
      brands,
      [
        {
          id: paymentIds.brand,
          organizationId: paymentIds.organization,
          name: 'Hostel name',
          archivedAt: options.archived === 'brand' ? paymentTime : null,
        },
      ],
    ],
    [
      organizations,
      [
        {
          id: paymentIds.organization,
          archivedAt: options.archived === 'organization' ? paymentTime : null,
        },
      ],
    ],
  ];
}
function residentRows(options: PaymentFixtureOptions): [unknown, unknown[]][] {
  return [
    [
      stays,
      options.missingStay
        ? []
        : [
            {
              id: paymentIds.stay,
              branchId: paymentIds.branch,
              residentId: paymentIds.resident,
              userId: null,
              ...options.stay,
            },
          ],
    ],
    [
      residents,
      options.resident === null
        ? []
        : [
            {
              id: paymentIds.resident,
              branchId: paymentIds.branch,
              displayName: 'Resident name',
              ...options.resident,
            },
          ],
    ],
  ];
}

export const paymentInvoice = {
  invoiceId: paymentIds.invoice,
  invoiceNumber: 'INV-1',
  currency: 'PKR' as const,
  dueDate: '2028-02-05',
  graceDays: 0,
  totalPaisa: 1800001,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
  outstandingPaisa: 1800001,
  state: 'issued' as const,
};
