import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError, type OccupancyPage } from '@hsm/contracts';
import {
  readResidentInvoiceBalances,
  residentInvoices,
  residentPaymentProofs,
  stays,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { withOccupancyRent } from './occupancy-rent.js';
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalances: vi.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stayId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const invoiceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor = { userId: branchId, sessionId: stayId };
const rooms: OccupancyPage['data'] = [
  {
    id: branchId,
    label: '101',
    roomTypeId: branchId,
    status: 'active',
    beds: [
      {
        id: branchId,
        label: 'A',
        ordinal: 1,
        status: 'active',
        state: 'occupied',
        occupant: { stayId, displayName: 'Resident' },
      },
      {
        id: invoiceId,
        label: 'B',
        ordinal: 2,
        status: 'active',
        state: 'available',
        occupant: null,
      },
    ],
  },
];
beforeEach(() => vi.clearAllMocks());
it('RENT-004 / ACC-002: never exposes financial status without finance_view or for historical dates', async () => {
  const f = queryFixture();
  vi.mocked(lockInventoryScope).mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Denied'));
  const denied = await withOccupancyRent(
    f.transaction,
    actor,
    branchId,
    rooms,
    '2026-11-02',
    '2026-11-02',
  );
  expect(denied[0]?.beds.map((bed) => bed.rentStatus)).toEqual([null, null]);
  expect(f.predicates).toHaveLength(0);
  await withOccupancyRent(f.transaction, actor, branchId, rooms, '2026-11-02', '2026-11-01');
  expect(lockInventoryScope).toHaveBeenCalledTimes(1);
  expect(readResidentInvoiceBalances).not.toHaveBeenCalled();
});
it.each([
  ['overdue', 'overdue'],
  ['paid', 'paid'],
  ['issued', 'due'],
  ['partially_paid', 'due'],
  ['no_charge', 'clear'],
] as const)(
  'PAY-008 / CHG-048: a %s invoice makes the bed %s from server balances, never a screenshot',
  async (state, expected) => {
    const f = queryFixture();
    f.enqueue(stays, [{ id: stayId }]);
    f.enqueue(residentInvoices, [{ invoiceId, stayId }]);
    vi.mocked(readResidentInvoiceBalances).mockResolvedValue([
      { invoiceId, state, dueDate: '2026-11-01' },
    ] as Awaited<ReturnType<typeof readResidentInvoiceBalances>>);
    const result = await withOccupancyRent(
      f.transaction,
      actor,
      branchId,
      rooms,
      '2026-11-02',
      '2026-11-02',
    );
    expect(result[0]?.beds.map((bed) => bed.rentStatus)).toEqual([expected, null]);
    expect(readResidentInvoiceBalances).toHaveBeenCalledWith(f.transaction, {
      branchId,
      today: '2026-11-02',
      invoices: [{ invoiceId, stayId }],
    });
  },
);
it('CHG-048: the most urgent invoice wins and an unbilled occupant is never shown as paid', async () => {
  const second = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const f = queryFixture();
  f.enqueue(stays, [{ id: stayId }]);
  f.enqueue(residentInvoices, [
    { invoiceId, stayId },
    { invoiceId: second, stayId },
  ]);
  vi.mocked(readResidentInvoiceBalances).mockResolvedValue([
    { invoiceId, state: 'paid' },
    { invoiceId: second, state: 'issued', dueDate: '2026-11-01' },
  ] as Awaited<ReturnType<typeof readResidentInvoiceBalances>>);
  const result = await withOccupancyRent(
    f.transaction,
    actor,
    branchId,
    rooms,
    '2026-11-02',
    '2026-11-02',
  );
  expect(result[0]?.beds[0]?.rentStatus).toBe('due');
  const empty = queryFixture();
  empty.enqueue(stays, [{ id: stayId }]);
  empty.enqueue(residentInvoices, []);
  const unbilled = await withOccupancyRent(
    empty.transaction,
    actor,
    branchId,
    rooms,
    '2026-11-02',
    '2026-11-02',
  );
  expect(unbilled[0]?.beds[0]?.rentStatus).toBe('clear');
});
it('Q5 / CHG-048: an unpaid invoice before its due date is not Due, matching the Rent Board', async () => {
  const early = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const run = async (balances: { invoiceId: string; state: string; dueDate: string }[]) => {
    const f = queryFixture();
    f.enqueue(stays, [{ id: stayId }]);
    f.enqueue(
      residentInvoices,
      balances.map((row) => ({ invoiceId: row.invoiceId, stayId })),
    );
    vi.mocked(readResidentInvoiceBalances).mockResolvedValue(
      balances as Awaited<ReturnType<typeof readResidentInvoiceBalances>>,
    );
    const result = await withOccupancyRent(
      f.transaction,
      actor,
      branchId,
      rooms,
      '2026-11-02',
      '2026-11-02',
    );
    return result[0]?.beds[0]?.rentStatus;
  };
  // Last month paid, next month issued early: still green.
  expect(
    await run([
      { invoiceId, state: 'paid', dueDate: '2026-10-05' },
      { invoiceId: early, state: 'issued', dueDate: '2026-12-05' },
    ]),
  ).toBe('paid');
  // Only an early invoice: nothing owed yet.
  expect(await run([{ invoiceId: early, state: 'issued', dueDate: '2026-12-05' }])).toBe('clear');
  // Due today (inside grace): Due.
  expect(await run([{ invoiceId: early, state: 'issued', dueDate: '2026-11-02' }])).toBe('due');
  // A part payment is always shown, as on the Rent Board.
  expect(await run([{ invoiceId: early, state: 'partially_paid', dueDate: '2026-12-05' }])).toBe(
    'due',
  );
});
it('PAY-004 / Q5 / CHG-048: a proof waiting for review shows as proof sent, ahead of overdue', async () => {
  const f = queryFixture();
  f.enqueue(stays, [{ id: stayId }]);
  f.enqueue(residentInvoices, [{ invoiceId, stayId }]);
  f.enqueue(residentPaymentProofs, [{ stayId }]);
  vi.mocked(readResidentInvoiceBalances).mockResolvedValue([
    { invoiceId, state: 'overdue', dueDate: '2026-10-05' },
  ] as Awaited<ReturnType<typeof readResidentInvoiceBalances>>);
  const result = await withOccupancyRent(
    f.transaction,
    actor,
    branchId,
    rooms,
    '2026-11-02',
    '2026-11-02',
  );
  // A proof alone never marks rent paid (PAY-008); it only flags staff action.
  expect(result[0]?.beds[0]?.rentStatus).toBe('proof_pending');
});
