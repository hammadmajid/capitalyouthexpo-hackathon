import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBranchOccupancy, readInventoryAccess } from '@hsm/api-client';
import { BedBoard } from './bed-board';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readBranchOccupancy: vi.fn(),
  readInventoryAccess: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  bedA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  bedB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  stayId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const page = {
  branchId,
  on: '2026-10-26',
  totals: { beds: 2, occupied: 1, blocked: 0, reserved: 1, unavailable: 0, available: 0 },
  data: [
    {
      id: roomId,
      label: '101',
      roomTypeId: roomId,
      status: 'active' as const,
      beds: [
        {
          id: bedA,
          label: 'A',
          ordinal: 1,
          status: 'active' as const,
          state: 'occupied' as const,
          occupant: { stayId, displayName: 'Resident One' },
          rentStatus: 'overdue' as const,
        },
        {
          id: bedB,
          label: 'B',
          ordinal: 2,
          status: 'active' as const,
          state: 'reserved' as const,
          occupant: null,
        },
      ],
    },
  ],
  nextCursor: roomId,
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
      <BedBoard actorId="actor" branchId={branchId} />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('BED-001 / RES-004: shows server occupancy in text, with occupant only on occupied beds', async () => {
  access(['stay_manage']);
  vi.mocked(readBranchOccupancy).mockResolvedValue(page);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'View Bed Board' }));
  expect(await screen.findByText('Bed A: Occupied — Resident One')).toBeDefined();
  expect(screen.getByText('Bed B: Reserved')).toBeDefined();
  expect(screen.getByRole('status').textContent).toContain('1 occupied · 1 reserved');
  expect(readBranchOccupancy).toHaveBeenLastCalledWith({}, branchId, { limit: 20 });
  fireEvent.click(screen.getByRole('button', { name: 'Next rooms' }));
  await waitFor(() =>
    expect(readBranchOccupancy).toHaveBeenLastCalledWith({}, branchId, {
      limit: 20,
      cursor: roomId,
    }),
  );
  fireEvent.change(screen.getByLabelText('Occupancy date'), { target: { value: '2026-11-01' } });
  await waitFor(() =>
    expect(readBranchOccupancy).toHaveBeenLastCalledWith({}, branchId, {
      limit: 20,
      on: '2026-11-01',
    }),
  );
});
it('RES-004: hidden without a live stay_manage grant and shows safe errors', async () => {
  access([]);
  show();
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'View Bed Board' })).toBeNull();
  cleanup();
  access(['stay_manage']);
  vi.mocked(readBranchOccupancy).mockRejectedValue(new Error('private failure detail'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'View Bed Board' }));
  expect((await screen.findByRole('alert')).textContent).not.toContain('private failure detail');
  fireEvent.click(screen.getByRole('button', { name: 'Close Bed Board' }));
  expect(screen.getByRole('button', { name: 'View Bed Board' })).toBeDefined();
});
it('CHG-048 / PAY-008: each bed shows its server rent colour with a text label', async () => {
  access(['stay_manage']);
  vi.mocked(readBranchOccupancy).mockResolvedValue(page);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'View Bed Board' }));
  const overdue = await screen.findByText('Occupied, Overdue');
  expect(overdue.className).toContain('border-hsm-dangerText');
  const reserved = screen
    .getAllByText('Reserved')
    .find((element) => element.tagName === 'SPAN' && element.className.includes('rounded-full'));
  expect(reserved?.className).toContain('border-hsm-muted');
  expect(screen.queryByText('Occupied, Paid')).toBeNull();
});
