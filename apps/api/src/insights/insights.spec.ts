import { beforeEach, expect, it, vi } from 'vitest';
import {
  bookings,
  branches,
  complaints,
  managerAssignments,
  notifications,
  readResidentFundBalance,
  readResidentInvoiceBalance,
  residentInvoices,
  residentPaymentProofs,
  residentPayments,
  stayFinalStatements,
  stays,
  transportSubscriptions,
} from '@hsm/db';
import { reportSchema, toCsv } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockStaffScope } from '../services/scope.js';
import { DashboardService } from './dashboard.service.js';
import { ReportService } from './reports.service.js';
import { renderReportPdf } from './report-pdf.js';
import { monthRange } from './metrics.js';
import { paisa } from './reports-operational.js';
import { InsightsController } from './insights.controller.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalance: vi.fn(),
  readResidentInvoiceBalances: vi.fn(
    async (
      _tx: unknown,
      value: { branchId: string; today: string; invoices: { invoiceId: string; stayId: string }[] },
    ) =>
      Promise.all(
        value.invoices.map(async (row) => ({
          ...(await readResidentInvoiceBalance(_tx as never, {
            branchId: value.branchId,
            today: value.today,
            ...row,
          })),
          invoiceId: row.invoiceId,
        })),
      ),
  ),
  readResidentFundBalance: vi.fn(),
  readResidentFundBalances: vi.fn(
    async (tx: unknown, value: { branchId: string; stayIds: string[] }) =>
      Promise.all(
        value.stayIds.map(async (stayId) => ({
          stayId,
          ...(await readResidentFundBalance(tx as never, { branchId: value.branchId, stayId })),
        })),
      ),
  ),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../services/scope.js', () => ({ lockStaffScope: vi.fn() }));
vi.mock('../stay/occupancy.repository.js', () => ({
  occupancyTotals: vi.fn(async () => ({
    beds: 4,
    occupied: 2,
    available: 1,
    reserved: 1,
    blocked: 0,
    unavailable: 0,
  })),
}));
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: '10000000-0000-4000-8000-000000000009' }),
}));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(9) } as never;
const now = new Date('2026-10-26T10:00:00Z');
const clock = () => now;
const balance = (state: string, outstanding: number) => ({
  state,
  totalPaisa: 1000,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 1000 - outstanding,
  outstandingPaisa: outstanding,
});
let store: ReturnType<typeof queryFixture>;
beforeEach(() => {
  store = queryFixture();
  vi.mocked(lockStaffScope)
    .mockReset()
    .mockResolvedValue({
      organizationId: id(1),
      branchId: id(3),
      actorUserId: id(9),
      actorRole: 'owner',
    });
  vi.mocked(readResidentInvoiceBalance).mockReset();
});
// actionCounts: bookings, proofs, complaints, stays counts, then overdue invoice scan.
function actions(overdue: unknown[] = []) {
  store.enqueue(bookings, [{ count: 1 }]);
  store.enqueue(residentPaymentProofs, [{ count: 2 }]);
  store.enqueue(complaints, [{ count: 3 }]);
  store.enqueue(stays, [{ count: 1 }]);
  store.enqueue(residentInvoices, overdue);
}
it('OWN-001..003: owner totals are exact sums of branch rows from shared definitions', async () => {
  const service = new DashboardService(store.database, clock);
  store.enqueue(branches, [
    { id: id(3), name: 'A', verificationStatus: 'approved' },
    { id: id(4), name: 'B', verificationStatus: 'approved' },
  ]);
  vi.mocked(readResidentInvoiceBalance)
    .mockResolvedValueOnce(balance('partially_paid', 400) as never)
    .mockResolvedValueOnce(balance('voided', 0) as never)
    .mockResolvedValueOnce(balance('overdue', 1000) as never)
    .mockResolvedValue(balance('overdue', 1000) as never);
  store.enqueue(stays, [{ count: 2 }]);
  store.enqueue(bookings, [{ count: 4 }]);
  store.enqueue(residentInvoices, [
    { id: id(5), stayId: id(6) },
    { id: id(7), stayId: id(6) },
  ]);
  actions([{ id: id(8), stayId: id(6) }]);
  store.enqueue(stays, [{ count: 1 }]);
  store.enqueue(bookings, [{ count: 1 }]);
  store.enqueue(residentInvoices, []);
  actions();
  const dash = await service.owner(actor, { month: '2026-12' });
  expect(dash.branches[0]).toMatchObject({
    occupancyPercent: 50,
    activeResidents: 2,
    rent: { invoices: 2, expectedPaisa: 1000, collectedPaisa: 600, outstandingPaisa: 400 },
    actions: { overdueInvoices: 1 },
  });
  expect(dash.branches[0]?.confirmedBookings).toBe(4);
  expect(dash.totals).toMatchObject({
    activeResidents: 3,
    confirmedBookings: 5,
    beds: { beds: 8, occupied: 4 },
    actions: { pendingBookings: 2, openComplaints: 6 },
  });
  store.enqueue(branches, []);
  await expect(service.owner(actor, { branchId: id(3) })).rejects.toMatchObject({ status: 404 });
  expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  expect(monthRange('2026-12').end).toBe('2026-12-31');
});
it('MGRD-001..005: branch dashboard shows money only with finance_view; analytics flags coverage', async () => {
  const service = new DashboardService(store.database, clock);
  vi.mocked(lockStaffScope).mockResolvedValueOnce({
    organizationId: id(1),
    branchId: id(3),
    actorUserId: id(9),
    actorRole: 'manager',
  });
  store.enqueue(managerAssignments, []);
  store.enqueue(bookings, [{ count: 1 }]);
  store.enqueue(stays, [{ count: 0 }]);
  actions();
  store.enqueue(notifications, [{ count: 4 }]);
  const manager = await service.manager(actor, id(3));
  expect(manager).toMatchObject({ rent: null, unreadNotices: 4, today: { moveIns: 1 } });
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(balance('issued', 1000) as never);
  store.enqueue(bookings, [{ count: 0 }]);
  store.enqueue(stays, [{ count: 0 }]);
  actions();
  store.enqueue(notifications, []);
  store.enqueue(residentInvoices, [{ id: id(5), stayId: id(6) }]);
  expect((await service.manager(actor, id(3))).rent).toMatchObject({ outstandingPaisa: 1000 });
  store.enqueue(branches, [{ id: id(3), name: 'A', verificationStatus: 'approved' }]);
  store.enqueue(
    bookings,
    [
      { state: 'confirmed', count: 2 },
      { state: 'expired', count: 3 },
    ],
    [{ hours: 30 }, { hours: 40 }, { hours: 50 }],
  );
  const analytics = await service.analytics(actor, { from: '2026-10-01', to: '2026-10-31' });
  expect(analytics.coverage).toEqual({ listingViews: 'not_collected', searches: 'not_collected' });
  expect(analytics.branches[0]).toMatchObject({
    bookingRequests: 5,
    confirmed: 2,
    expired: 3,
    averageResponseHours: 40,
    slowResponses: 3,
    warnings: [expect.any(String), expect.any(String)],
  });
  store.enqueue(branches, [{ id: id(3), name: 'A', verificationStatus: 'approved' }]);
  expect(
    (await service.analytics(actor, { from: '2026-10-01', to: '2026-10-31' })).branches[0],
  ).toMatchObject({ averageResponseHours: null, warnings: [] });
});
it('RPT-001/002: every report family is scoped, bounded, formatted and audited', async () => {
  const service = new ReportService(store.database, clock);
  const owned = [{ id: id(3), name: 'A', verificationStatus: 'approved' }];
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(balance('overdue', 500) as never);
  vi.mocked(readResidentFundBalance).mockResolvedValue({
    deposit: {
      receivedPaisa: 5000,
      appliedToRentPaisa: 0,
      deductedPaisa: 100,
      refundedPaisa: 0,
      heldPaisa: 4900,
    },
  } as never);
  const names = () => store.enqueue(branches, [{ id: id(3), name: 'A' }]);
  const orgs = () => store.enqueue(branches, [{ organizationId: id(1) }]);
  const settlement = {
    stayId: id(6),
    branchId: id(3),
    stayState: 'completed',
    invoices: [],
    invoicesTruncated: false,
    outstandingPaisa: 0,
    deposit: {
      receivedPaisa: 0,
      appliedToRentPaisa: 0,
      deductedPaisa: 0,
      refundedPaisa: 0,
      heldPaisa: 0,
    },
    advance: {
      receivedPaisa: 0,
      appliedToRentPaisa: 0,
      deductedPaisa: 0,
      refundedPaisa: 0,
      heldPaisa: 0,
    },
    netPayablePaisa: 0,
    netRefundablePaisa: 0,
    fundSources: [],
    asOf: '2026-10-26',
  };
  const cases: [string, () => void][] = [
    ['occupancy', () => names()],
    [
      'residents',
      () => {
        names();
        store.enqueue(stays, [
          {
            branchId: id(3),
            name: '=cmd',
            state: 'active',
            moveIn: '2026-06-25',
            leave: null,
            closedAt: null,
            room: '1',
            bed: 'A',
          },
        ]);
      },
    ],
    [
      'bookings',
      () => {
        names();
        store.enqueue(bookings, [
          {
            branchId: id(3),
            createdAt: now,
            moveIn: '2026-11-01',
            moveOut: '2026-12-01',
            state: 'confirmed',
          },
        ]);
      },
    ],
    [
      'complaints',
      () => {
        names();
        store.enqueue(complaints, [
          {
            branchId: id(3),
            createdAt: now,
            category: 'wifi',
            status: 'open',
            title: 't',
            resolvedAt: null,
            reopenCount: 0,
          },
        ]);
      },
    ],
    [
      'transport-subscribers',
      () => {
        names();
        store.enqueue(transportSubscriptions, [
          {
            branchId: id(3),
            route: 'R',
            resident: 'X',
            status: 'active',
            from: '2026-07-01',
            to: null,
            charge: 310000n,
          },
        ]);
      },
    ],
    [
      'rent-collection',
      () => {
        names();
        store.enqueue(residentInvoices, [{ id: id(5), stayId: id(6) }], [], []);
      },
    ],
    [
      'outstanding-dues',
      () => {
        names();
        store.enqueue(residentInvoices, [
          {
            id: id(5),
            branchId: id(3),
            stayId: id(6),
            number: 'INV-1',
            due: '2026-10-05',
            resident: 'X',
          },
        ]);
      },
    ],
    [
      'payment-history',
      () => {
        names();
        store.enqueue(residentPayments, [
          {
            branchId: id(3),
            paidOn: '2026-10-01',
            receipt: 'R-1',
            resident: 'X',
            amount: 1800050n,
            reference: null,
          },
        ]);
      },
    ],
    [
      'security-deposits',
      () => {
        names();
        store.enqueue(stays, [{ id: id(6), branchId: id(3), resident: 'X', state: 'completed' }]);
      },
    ],
    [
      'checkout-history',
      () => {
        names();
        store.enqueue(stayFinalStatements, [
          { branchId: id(3), createdAt: now, snapshot: settlement, resident: 'X' },
        ]);
      },
    ],
  ];
  for (const [type, seed] of cases) {
    store.enqueue(branches, owned);
    seed();
    orgs();
    const file = await service.owner(actor, type, {
      format: 'csv',
      from: '2026-09-01',
      to: '2026-11-30',
    });
    expect(file.report.type).toBe(type);
    expect(file.contentType).toContain('text/csv');
  }
  // Undated windows and rows whose branch name is unknown take the fallback paths.
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(balance('paid', 0) as never);
  vi.mocked(readResidentFundBalance).mockResolvedValue({
    deposit: {
      receivedPaisa: 0,
      appliedToRentPaisa: 0,
      deductedPaisa: 0,
      refundedPaisa: 0,
      heldPaisa: 0,
    },
  } as never);
  for (const [type, seed] of cases) {
    store.enqueue(branches, owned);
    seed();
    orgs();
    const file = await service.owner(actor, type, {});
    expect(file.contentType).toBe('application/json');
  }
  store.enqueue(branches, owned);
  await expect(service.owner(actor, 'residents', { branchIds: id(4) })).rejects.toMatchObject({
    status: 404,
  });
  names();
  store.enqueue(stays, [
    {
      branchId: id(3),
      name: 'X',
      state: 'active',
      moveIn: '2026-06-25',
      leave: '2026-12-25',
      closedAt: now,
      room: null,
      bed: null,
    },
  ]);
  orgs();
  const pdf = await service.branch(actor, id(3), 'residents', { format: 'pdf' });
  expect((pdf.body as Buffer).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(vi.mocked(lockStaffScope).mock.calls.at(-1)?.[3]).toEqual(['stay_manage']);
  names();
  store.enqueue(residentPayments, []);
  orgs();
  expect((await service.branch(actor, id(3), 'payment-history', {})).contentType).toBe(
    'application/json',
  );
  expect(vi.mocked(lockStaffScope).mock.calls.at(-1)?.[3]).toEqual(['finance_view']);
  await expect(
    service.branch(actor, id(3), 'residents', { branchIds: id(4) }),
  ).rejects.toMatchObject({ status: 404 });
  expect(paisa(-150n)).toBe('-1.50');
  expect(toCsv({ columns: ['a'], rows: [['=1+1'], ['"q"']] })).toBe(
    '"a"\r\n"\'=1+1"\r\n"""q"""\r\n',
  );
  const long = reportSchema.parse({
    type: 'residents',
    from: null,
    to: null,
    columns: ['Name'],
    rows: Array.from({ length: 120 }, (_, i) => ['Resident ' + i + ' (ü)']),
    truncated: true,
  });
  const rendered = renderReportPdf(long, 'Report').toString('latin1');
  expect(rendered).toContain('/Count 3');
  expect(rendered).toContain('Resident 1 \\(?\\)');
});
it('Phase 10 insights controller sets download headers and delegates', async () => {
  const file = { report: {}, body: 'x', contentType: 'text/csv', filename: 'r.csv' };
  const reply = { header: vi.fn().mockReturnThis() };
  const service = {
    owner: vi.fn().mockResolvedValue(file),
    branch: vi.fn().mockResolvedValue(file),
    manager: vi.fn().mockResolvedValue('m'),
    analytics: vi.fn().mockResolvedValue('a'),
  };
  const controller = new InsightsController({
    dashboards: service as never,
    reports: service as never,
  });
  const request = {} as never;
  expect(await controller.owner(request, {})).toBe(file);
  expect(await controller.analytics(request, {})).toBe('a');
  expect(await controller.manager(request, id(3))).toBe('m');
  expect(await controller.ownerReport(request, reply as never, 'residents', {})).toBe('x');
  expect(await controller.branchReport(request, reply as never, id(3), 'residents', {})).toBe('x');
  expect(reply.header).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="r.csv"');
});

it('AUD-009 / OWN-003: owner paging never drops totals or the 101st branch', async () => {
  const rows = Array.from({ length: 102 }, (_, index) => ({
    id: id(100 + index),
    name: 'Branch ' + String(index).padStart(3, '0'),
    verificationStatus: 'approved',
  }));
  store.enqueue(branches, rows.slice(0, 100), rows.slice(100));
  const service = new DashboardService(store.database, clock);
  const first = await service.owner(actor, {});
  expect(first.totals.beds.beds).toBe(408);
  expect(first.branches).toHaveLength(100);
  expect(first).toHaveProperty('nextCursor', id(199));
  store.enqueue(branches, rows.slice(0, 100), rows.slice(100));
  const next = await service.owner(actor, { cursor: id(199) });
  expect(next.branches.map((row) => row.branchId)).toEqual([id(200), id(201)]);
  expect(next.totals.beds.beds).toBe(408);
  expect(next).toHaveProperty('nextCursor', null);
  store.enqueue(branches, rows.slice(0, 1));
  await expect(service.owner(actor, { cursor: id(999) })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(() => service.owner(actor, { branchId: id(100), cursor: id(199) })).toThrow();
});
