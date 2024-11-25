import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  readBedOccupancy,
  readInventoryAccess,
  readOwnStayRecord,
  readResidentDirectory,
  readResidentProfile,
  readStaffStayRecord,
} from '@hsm/api-client';
import { ResidentDirectory } from './resident-directory';
import { StayRecordPanel } from './stay-record';
import { BedDetail } from './bed-detail';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readBedOccupancy: vi.fn(),
  readInventoryAccess: vi.fn(),
  readOwnStayRecord: vi.fn(),
  readResidentDirectory: vi.fn(),
  readResidentProfile: vi.fn(),
  readStaffStayRecord: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  residentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  stayId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  bedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
};
const record = {
  stayId,
  branch: { id: branchId, name: 'Branch A' },
  agreements: [
    {
      id: stayId,
      version: 1,
      effectiveFrom: '2026-10-01',
      terms: {
        policyVersionId: stayId,
        currency: 'PKR',
        fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 300000 }],
        catalog: [],
        rentAmountPaisa: 1800000,
        depositPaisa: 500000,
        policy,
      },
      fromBooking: true,
      createdAt: '2026-10-01T05:00:00.000Z',
    },
  ],
  assignments: [
    {
      id: stayId,
      roomTypeId: stayId,
      roomTypeName: 'Standard',
      roomId: stayId,
      roomLabel: '101',
      bedId,
      bedLabel: 'A',
      startedAt: '2026-10-01T05:00:00.000Z',
      endedAt: null,
    },
  ],
  history: [
    {
      id: stayId,
      previousState: null,
      nextState: 'active',
      reasonCode: 'booking_check_in',
      createdAt: '2026-10-01T05:00:00.000Z',
    },
  ],
  truncated: false,
};
function show(node: ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('STAY-002: the record shows the original agreement, accommodation and history', async () => {
  vi.mocked(readStaffStayRecord).mockResolvedValue(record as never);
  show(<StayRecordPanel actorId="a" branchId={branchId} stayId={stayId} />);
  expect(await screen.findByText('Agreed rent: PKR 18,000 per billing period')).toBeDefined();
  expect(screen.getByText('Deposit: PKR 5,000')).toBeDefined();
  expect(screen.getByText(/mess: PKR 3,000 \(monthly\)/)).toBeDefined();
  expect(screen.getByText(/Version 1 from 2026-10-01 · from confirmed booking/)).toBeDefined();
  expect(screen.getByText(/Standard · Room 101 · Bed A/)).toBeDefined();
  expect(screen.getByText(/active \(booking check in\)/)).toBeDefined();
  expect(readStaffStayRecord).toHaveBeenCalledWith({}, branchId, stayId);
});
it('CHG-012 / SEC-003: own record uses the self route and shows safe retryable errors', async () => {
  vi.mocked(readOwnStayRecord).mockRejectedValueOnce(new Error('private detail'));
  vi.mocked(readOwnStayRecord).mockResolvedValueOnce({ ...record, truncated: true } as never);
  show(<StayRecordPanel actorId="a" stayId={stayId} />);
  expect((await screen.findByRole('alert')).textContent).not.toContain('private detail');
  fireEvent.click(screen.getByRole('button', { name: 'Retry agreement and history' }));
  expect(await screen.findByText(/most recent 50 entries/)).toBeDefined();
  expect(readStaffStayRecord).not.toHaveBeenCalled();
});
it('RES-004: directory filters, pages and opens a profile with its Stays', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['stay_manage'],
    canConfigureManagers: false,
  } as never);
  vi.mocked(readResidentDirectory).mockResolvedValue({
    data: [
      {
        id: residentId,
        displayName: 'Resident One',
        linked: true,
        status: 'current',
        currentStay: {
          id: stayId,
          state: 'active',
          moveInDate: '2026-10-01',
          roomLabel: '101',
          bedLabel: 'A',
        },
      },
    ],
    nextCursor: residentId,
  });
  vi.mocked(readResidentProfile).mockResolvedValue({
    id: residentId,
    branchId,
    displayName: 'Resident One',
    contact: { phone: '+923001234567', email: null },
    cnicLast4: null,
    linked: true,
    archived: false,
    createdAt: '2026-10-01T05:00:00.000Z',
    status: 'current',
    currentStay: null,
    stays: [
      {
        id: stayId,
        source: 'booking',
        state: 'active',
        moveInDate: '2026-10-01',
        expectedLeaveDate: null,
        closedAt: null,
      },
    ],
    staysTruncated: false,
  });
  vi.mocked(readStaffStayRecord).mockResolvedValue(record as never);
  show(<ResidentDirectory actorId="a" branchId={branchId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'View residents' }));
  expect(
    await screen.findByText(/Current resident · Linked account · Room 101, Bed A/),
  ).toBeDefined();
  fireEvent.change(screen.getByLabelText('Resident status'), { target: { value: 'current' } });
  fireEvent.change(screen.getByLabelText('Account link'), { target: { value: 'true' } });
  fireEvent.change(screen.getByLabelText('Sort residents'), { target: { value: 'newest' } });
  fireEvent.change(screen.getByLabelText('Search residents by name'), { target: { value: 'One' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search residents' }));
  await waitFor(() =>
    expect(readResidentDirectory).toHaveBeenLastCalledWith({}, branchId, {
      sort: 'newest',
      status: 'current',
      linked: 'true',
      q: 'One',
      limit: 20,
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Next residents' }));
  await waitFor(() =>
    expect(readResidentDirectory).toHaveBeenLastCalledWith(
      {},
      branchId,
      expect.objectContaining({ cursor: residentId }),
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Previous residents' }));
  fireEvent.change(screen.getByLabelText('Resident status'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Account link'), { target: { value: '' } });
  fireEvent.click(await screen.findByRole('button', { name: 'View profile for Resident One' }));
  expect(await screen.findByText('Phone: +923001234567')).toBeDefined();
  expect(screen.getByText('Linked to a customer account')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'View agreement and history (2026-10-01)' }));
  expect(await screen.findByText('Hostel branch: Branch A')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Close resident profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close residents' }));
  expect(screen.getByRole('button', { name: 'View residents' })).toBeDefined();
});
it('RES-004: hidden without stay_manage', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: [],
    canConfigureManagers: false,
  } as never);
  show(<ResidentDirectory actorId="a" branchId={branchId} />);
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'View residents' })).toBeNull();
});
it('BED-002: bed detail lists claims and opens the occupant Stay record', async () => {
  vi.mocked(readBedOccupancy).mockResolvedValue({
    branchId,
    on: '2026-10-26',
    room: {
      id: stayId,
      label: '101',
      roomTypeId: stayId,
      roomTypeName: 'Standard',
      status: 'active',
    },
    bed: {
      id: bedId,
      label: 'A',
      ordinal: 1,
      status: 'active',
      state: 'occupied',
      occupant: { stayId, displayName: 'Resident One' },
    },
    claims: [
      {
        source: 'assignment',
        bookingId: null,
        stayId,
        moveInDate: '2026-10-01',
        moveOutDate: null,
        wholeRoom: false,
      },
    ],
  });
  vi.mocked(readStaffStayRecord).mockResolvedValue(record as never);
  const close = vi.fn();
  show(<BedDetail actorId="a" branchId={branchId} bedId={bedId} on="" close={close} />);
  expect(
    await screen.findByText(/Resident assignment \(occupancy\): 2026-10-01 to open-ended/),
  ).toBeDefined();
  expect(await screen.findByText('Hostel branch: Branch A')).toBeDefined();
  expect(readBedOccupancy).toHaveBeenCalledWith({}, branchId, bedId, {});
  fireEvent.click(screen.getByRole('button', { name: 'Close bed details' }));
  expect(close).toHaveBeenCalled();
});
