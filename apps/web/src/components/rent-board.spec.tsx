import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readInventoryAccess, readRentBoard } from '@hsm/api-client';
import { RentBoard } from './rent-board';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
  readRentBoard: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stayId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  invoiceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const invoice = {
  invoiceId,
  invoiceNumber: 'INV-1',
  currency: 'PKR' as const,
  dueDate: '2026-10-05',
  graceDays: 3,
  totalPaisa: 1800000,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
  outstandingPaisa: 1800000,
  state: 'overdue' as const,
};
function access(permissions: string[]) {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions,
    canConfigureManagers: false,
  } as never);
}
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RentBoard actorId="a" branchId={branchId} />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('RB-001/002: shows written invoice states, amounts and pages from the server', async () => {
  access(['finance_view']);
  vi.mocked(readRentBoard).mockResolvedValue({
    branchId,
    month: '2026-10',
    data: [
      {
        stayId,
        residentId: stayId,
        displayName: 'Resident One',
        stayState: 'active',
        roomLabel: '101',
        bedLabel: 'A',
        state: 'overdue',
        pendingProofs: 0,
        invoices: [invoice],
      },
      {
        stayId: invoiceId,
        residentId: invoiceId,
        displayName: 'Resident Two',
        stayState: 'active',
        roomLabel: null,
        bedLabel: null,
        state: 'not_billed',
        pendingProofs: 0,
        invoices: [],
      },
    ],
    nextCursor: invoiceId,
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'View Rent Board' }));
  expect(await screen.findByText('Resident One · Room 101, Bed A')).toBeDefined();
  expect(screen.getAllByText('Status: Overdue')).toHaveLength(1);
  expect(screen.getByText('Status: Not billed this month')).toBeDefined();
  expect(
    screen.getByText(
      /INV-1: due 2026-10-05 \(grace 3 days\) · total PKR 18,000 · outstanding PKR 18,000/,
    ),
  ).toBeDefined();
  expect(screen.queryByText(/Paid/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next Stays' }));
  await waitFor(() =>
    expect(readRentBoard).toHaveBeenLastCalledWith({}, branchId, { cursor: invoiceId }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Previous Stays' }));
  fireEvent.change(screen.getByLabelText('Billing month'), { target: { value: '2026-09' } });
  await waitFor(() =>
    expect(readRentBoard).toHaveBeenLastCalledWith({}, branchId, { month: '2026-09' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close Rent Board' }));
  expect(screen.getByRole('button', { name: 'View Rent Board' })).toBeDefined();
});
it('RB-001 / SEC-003: hidden without finance_view; failures are safe', async () => {
  access(['stay_manage']);
  show();
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'View Rent Board' })).toBeNull();
  cleanup();
  access(['finance_view']);
  vi.mocked(readRentBoard).mockRejectedValue(new Error('private failure detail'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'View Rent Board' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain('private failure detail');
});
