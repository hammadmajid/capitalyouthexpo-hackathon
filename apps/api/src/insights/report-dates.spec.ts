import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  bookings,
  branches,
  complaints,
  residentPayments,
  stayFinalStatements,
  stays,
} from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  bookingsReport,
  complaintsReport,
  residentsReport,
  type Table,
  type Window,
} from './reports-operational.js';
import { checkoutsReport, paymentsReport } from './reports-financial.js';

const branch = '10000000-0000-4000-8000-000000000001';
const zero = {
  receivedPaisa: 0,
  appliedToRentPaisa: 0,
  deductedPaisa: 0,
  refundedPaisa: 0,
  heldPaisa: 0,
};
const snapshot = {
  stayId: '10000000-0000-4000-8000-000000000002',
  branchId: branch,
  stayState: 'completed',
  invoices: [],
  invoicesTruncated: false,
  outstandingPaisa: 0,
  deposit: zero,
  advance: zero,
  netPayablePaisa: 0,
  netRefundablePaisa: 0,
  fundSources: [],
  asOf: '2024-02-29',
};
const families: {
  name: string;
  table: unknown;
  run: (tx: Transaction, ids: string[], w: Window) => Promise<Table>;
  row: (instant: Date) => Record<string, unknown>;
  dateIndex: number;
}[] = [
  {
    name: 'bookings',
    table: bookings,
    run: bookingsReport,
    dateIndex: 1,
    row: (instant) => ({
      branchId: branch,
      createdAt: instant,
      moveIn: '2024-02-29',
      moveOut: '2024-03-31',
      state: 'confirmed',
    }),
  },
  {
    name: 'complaints',
    table: complaints,
    run: complaintsReport,
    dateIndex: 1,
    row: (instant) => ({
      branchId: branch,
      createdAt: instant,
      category: 'other',
      status: 'open',
      title: 'Fixture',
      resolvedAt: null,
      reopenCount: 0,
    }),
  },
  {
    name: 'residents',
    table: stays,
    run: residentsReport,
    dateIndex: 7,
    row: (instant) => ({
      branchId: branch,
      name: 'Fixture',
      state: 'completed',
      moveIn: '2024-02-28',
      leave: '2024-02-29',
      closedAt: instant,
      room: 'R',
      bed: 'A',
    }),
  },
  {
    name: 'checkouts',
    table: stayFinalStatements,
    run: checkoutsReport,
    dateIndex: 1,
    row: (instant) => ({ branchId: branch, createdAt: instant, snapshot, resident: 'Fixture' }),
  },
];
const dates = [
  '2026-10-27',
  '2026-01-31',
  '2026-12-31',
  '2026-02-28',
  '2024-02-28',
  '2024-02-29',
  '9999-12-31',
];
function window(on: string): Window {
  return { from: on, to: on, today: on, now: new Date('2026-10-27T10:00:00Z') };
}
function fixture() {
  const f = queryFixture();
  f.enqueue(branches, [{ id: branch, name: 'Scoped fixture' }]);
  return f;
}

for (const family of families) {
  it.each(dates)(
    'RPT-001 / AUD-004: ' + family.name + ' includes the whole Karachi To date %s',
    async (on) => {
      const f = fixture();
      f.enqueue(family.table, []);
      await family.run(f.transaction, [branch], window(on));
      const predicate = f.predicates.find((value) => value.table === family.table);
      if (!predicate) throw new Error('Report predicate missing');
      const query = new PgDialect().sqlToQuery(predicate.value);
      expect(query.params).toContain(new Date(on + 'T00:00:00+05:00').toISOString());
      // Following local midnight is 19:00 UTC on the requested To calendar date.
      expect(query.params).toContain(on + 'T19:00:00.000Z');
      expect(query.sql).toContain(' >= ');
      expect(query.sql).toContain(' < ');
    },
  );
  it(
    'RPT-001 / AUD-004: ' +
      family.name +
      ' displays a timestamp at Karachi midnight on its local calendar date',
    async () => {
      const f = fixture();
      f.enqueue(family.table, [family.row(new Date('2024-02-28T19:00:00.000Z'))]);
      const report = await family.run(f.transaction, [branch], window('2024-02-29'));
      expect(report.rows[0]?.[family.dateIndex]).toBe('2024-02-29');
    },
  );
}
it('RPT-001 / AUD-004: payment-history date columns retain their already-inclusive calendar bounds', async () => {
  const f = fixture();
  f.enqueue(residentPayments, []);
  await paymentsReport(f.transaction, [branch], window('2024-02-29'));
  const predicate = f.predicates.find((value) => value.table === residentPayments);
  if (!predicate) throw new Error('Payment predicate missing');
  const query = new PgDialect().sqlToQuery(predicate.value);
  expect(query.params).toEqual([branch, '2024-02-29', '2024-02-29']);
  expect(query.sql).toContain(' <= ');
});
