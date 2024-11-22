import { beforeEach, expect, it, vi } from 'vitest';
import { readResidentInvoiceBalance, residentInvoices, stays } from '@hsm/db';
import { rentBoardQuerySchema, rentBoardState } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { RentBoardRepository, rentBoardMonth } from './rent-board.repository.js';
import { rentBoardService, RentBoardService } from './rent-board.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalance: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
const branch = '10000000-0000-4000-8000-000000000001',
  stayA = '20000000-0000-4000-8000-000000000001',
  stayB = '20000000-0000-4000-8000-000000000002',
  invoice = '30000000-0000-4000-8000-000000000001',
  resident = '40000000-0000-4000-8000-000000000001';
const actor = { userId: '50000000-0000-4000-8000-000000000001' } as never;
// 2026-10-31T20:00Z is already 1 November in Asia/Karachi.
const now = new Date('2026-10-31T20:00:00Z');
const row = (stayId: string) => ({
  stayId,
  residentId: resident,
  displayName: 'Resident',
  stayState: 'active',
  roomLabel: '101',
  bedLabel: 'A',
});
const balance = {
  invoiceId: invoice,
  invoiceNumber: 'INV-1',
  currency: 'PKR',
  dueDate: '2026-11-05',
  graceDays: 3,
  totalPaisa: 1800000,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
  outstandingPaisa: 1800000,
  state: 'issued',
};
it('RB-002 / Q5: board state follows the most urgent real invoice state', () => {
  expect(rentBoardState([])).toBe('not_billed');
  expect(rentBoardState(['paid', 'issued'])).toBe('issued');
  expect(rentBoardState(['paid', 'partially_paid', 'overdue'])).toBe('overdue');
  expect(rentBoardState(['voided', 'no_charge'])).toBe('no_charge');
  // Q5: a pending proof is action needed even when the invoice is partially paid.
  expect(rentBoardState(['partially_paid'], 1)).toBe('proof_pending');
  expect(rentBoardState([], 0)).toBe('not_billed');
});
it('RB-004: Karachi month bounds handle leap years and month lengths', () => {
  expect(rentBoardMonth('2028-02')).toMatchObject({ start: '2028-02-01', end: '2028-02-29' });
  expect(rentBoardMonth('2026-02').end).toBe('2026-02-28');
  expect(rentBoardMonth('2026-04').end).toBe('2026-04-30');
  expect(rentBoardMonth('2026-12').startsAt.toISOString()).toBe('2026-11-30T19:00:00.000Z');
});
it('RB-001..004: one bounded page with authoritative balances under finance_view', async () => {
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(balance as never);
  const store = queryFixture();
  store.enqueue(stays, [row(stayA), row(stayB)]);
  store.enqueue(residentInvoices, [{ id: invoice, stayId: stayA }]);
  const page = await new RentBoardRepository(store.database, () => now).page(
    actor,
    branch,
    rentBoardQuerySchema.parse({ limit: 1 }),
  );
  expect(page.month).toBe('2026-11');
  expect(page.data).toEqual([
    { ...row(stayA), state: 'issued', pendingProofs: 0, invoices: [balance] },
  ]);
  expect(page.nextCursor).toBe(stayA);
  expect(readResidentInvoiceBalance).toHaveBeenCalledWith(store.transaction, {
    branchId: branch,
    stayId: stayA,
    invoiceId: invoice,
    today: '2026-11-01',
  });
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branch, 'finance_view');
  expect(store.writes).toHaveLength(0);
});
it('RB-004: an empty month reads no invoices; inconsistent balances are internal errors', async () => {
  const empty = await new RentBoardRepository(queryFixture().database, () => now).page(
    actor,
    branch,
    rentBoardQuerySchema.parse({ month: '2026-09', cursor: stayA }),
  );
  expect(empty).toEqual({ branchId: branch, month: '2026-09', data: [], nextCursor: null });
  expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue({ ...balance, state: 'paid' } as never);
  const store = queryFixture();
  store.enqueue(stays, [row(stayA)]);
  store.enqueue(residentInvoices, [{ id: invoice, stayId: stayA }]);
  await expect(
    new RentBoardRepository(store.database, () => now).page(
      actor,
      branch,
      rentBoardQuerySchema.parse({}),
    ),
  ).rejects.toMatchObject({ status: 500 });
});
it('RB-004: the service validates input and builds the production repository', async () => {
  const service = rentBoardService(queryFixture().database, () => now);
  expect(service).toBeInstanceOf(RentBoardService);
  await expect(service.page(actor, branch, { month: '2026-10' })).resolves.toMatchObject({
    month: '2026-10',
    data: [],
  });
  await expect(service.page(actor, branch, { month: '2026-13' })).rejects.toThrow();
  await expect(service.page(actor, 'bad', {})).rejects.toThrow();
});
