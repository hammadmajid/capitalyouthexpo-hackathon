jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  readBedOccupancy,
  readOwnStayRecord,
  readResidentDirectory,
  readResidentProfile,
  readStaffStayRecord,
} from '@hsm/api-client';
import { NativeResidentDirectory } from './resident-directory';
import { NativeStayRecord } from './stay-record';
import { NativeBedDetail } from './bed-detail';
import { pullToRefresh } from '../test-utils/pull-refresh';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('./staff-stay-workspace', () => ({
  StaffStayWorkspace: (props: { stayId: string; onClose: () => void }) => {
    const { Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to residents"
        onPress={props.onClose}
      >
        <Text>{'Stay workspace ' + props.stayId}</Text>
      </Pressable>
    );
  },
}));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBedOccupancy: jest.fn(),
  readOwnStayRecord: jest.fn(),
  readResidentDirectory: jest.fn(),
  readResidentProfile: jest.fn(),
  readStaffStayRecord: jest.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  residentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  stayId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  bedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
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
        fees: [{ code: 'mess', cadence: 'one_time', amountPaisa: 100000 }],
        catalog: [],
        rentAmountPaisa: 1800000,
        depositPaisa: 0,
        policy: {
          cycle: { kind: 'calendar_month', dueDay: 5 },
          graceDays: 3,
          noticeDays: 15,
        },
      },
      fromBooking: false,
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
      bedId: null,
      bedLabel: null,
      startedAt: '2026-10-01T05:00:00.000Z',
      endedAt: '2026-10-05T05:00:00.000Z',
    },
  ],
  history: [
    {
      id: stayId,
      previousState: 'active',
      nextState: 'completed',
      reasonCode: 'checkout',
      createdAt: '2026-10-05T05:00:00.000Z',
    },
  ],
  truncated: true,
};
let cache = new QueryClient();
async function show(node: ReactNode) {
  cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0 }, mutations: { gcTime: 0 } } });
  await render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
}
beforeEach(() => jest.clearAllMocks());
it('STAY-002: staff record shows original terms, accommodation and history', async () => {
  jest.mocked(readStaffStayRecord).mockResolvedValue(record as never);
  await show(<NativeStayRecord actorId="a" branchId={branchId} stayId={stayId} />);
  expect(await screen.findByText('Rent PKR 18,000')).toBeTruthy();
  // Terms read 'From <date>'; booking/walk-in origin is no longer shown.
  expect(screen.getByText(/^From /)).toBeTruthy();
  expect(screen.queryByText(/Walk-in/)).toBeNull();
  expect(screen.getByText(/mess PKR 1,000 · one time/)).toBeTruthy();
  expect(screen.getByText(/Room 101 · Whole room/)).toBeTruthy();
  expect(screen.getByText(/Active → Completed/)).toBeTruthy();
  expect(screen.getByText('Showing the latest 50')).toBeTruthy();
});
it('CHG-012 / SEC-003: own record uses the self route and retries safely', async () => {
  jest.mocked(readOwnStayRecord).mockRejectedValueOnce(new Error('private detail'));
  jest.mocked(readOwnStayRecord).mockResolvedValueOnce({ ...record, truncated: false } as never);
  await show(<NativeStayRecord actorId="a" stayId={stayId} />);
  await waitFor(() => expect(readOwnStayRecord).toHaveBeenCalled());
  expect(screen.queryByText(/private detail/)).toBeNull();
  await screen.findAllByRole('alert');
  await pullToRefresh(cache);
  expect(await screen.findByLabelText('Stay record · Hostel branch: Branch A')).toBeTruthy();
  expect(readStaffStayRecord).not.toHaveBeenCalled();
});
it('RES-004: directory searches, filters, pages and opens a profile', async () => {
  jest.mocked(readResidentDirectory).mockResolvedValue({
    data: [
      {
        id: residentId,
        displayName: 'Resident One',
        linked: false,
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
  jest.mocked(readResidentProfile).mockResolvedValue({
    id: residentId,
    branchId,
    displayName: 'Resident One',
    contact: { phone: null, email: 'one@example.test' },
    cnicLast4: '5671',
    linked: false,
    archived: false,
    createdAt: '2026-10-01T05:00:00.000Z',
    status: 'current',
    currentStay: null,
    stays: [
      {
        id: stayId,
        source: 'manual',
        state: 'active',
        moveInDate: '2026-10-01',
        expectedLeaveDate: null,
        closedAt: null,
      },
    ],
    staysTruncated: false,
  });
  jest.mocked(readStaffStayRecord).mockResolvedValue(record as never);
  await show(<NativeResidentDirectory actorId="a" branchId={branchId} />);
  // CHG-048: the list shows straight away; one person per card with their place.
  const card = { name: 'Resident One, Living here, Room 101 · Bed A' };
  await screen.findByRole('button', card);
  await fireEvent.press(screen.getByRole('button', { name: 'Search Residents' }));
  await fireEvent.changeText(screen.getByLabelText('Search residents by name'), 'One');
  await fireEvent.press(screen.getByRole('button', { name: 'Search residents' }));
  await waitFor(() =>
    expect(readResidentDirectory).toHaveBeenLastCalledWith({}, branchId, { limit: 20, q: 'One' }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Next residents' }));
  await waitFor(() =>
    expect(readResidentDirectory).toHaveBeenLastCalledWith(
      {},
      branchId,
      expect.objectContaining({ cursor: residentId }),
    ),
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'First residents' }));
  await fireEvent.press(await screen.findByRole('button', card));
  expect(await screen.findByText('Stay workspace ' + stayId)).toBeTruthy();
  expect(screen.queryByText('Stays')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to residents' }));
  expect(await screen.findByRole('button', card)).toBeTruthy();
});
it('RES-004 / CHG-048: a filter shows only when it has people', async () => {
  jest.mocked(readResidentDirectory).mockImplementation(async (_client, _branch, query) => {
    const status = (query as { status?: string }).status;
    return {
      data:
        status === 'none' || status === 'former'
          ? []
          : [
              {
                id: residentId,
                displayName: 'Resident One',
                linked: false,
                status: 'current',
                currentStay: {
                  id: stayId,
                  state: 'notice_given',
                  moveInDate: '2026-10-01',
                  roomLabel: '101',
                  bedLabel: 'A',
                },
              },
            ],
      nextCursor: null,
    } as never;
  });
  await show(<NativeResidentDirectory actorId="a" branchId={branchId} />);
  expect(
    await screen.findByRole('button', { name: 'Resident One, Notice given, Room 101 · Bed A' }),
  ).toBeTruthy();
  await waitFor(() => expect(readResidentDirectory).toHaveBeenCalledTimes(4));
  expect(screen.queryByRole('button', { name: 'Show left' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Show no stay' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Show all residents' })).toBeNull();
});
it('BED-002: bed detail lists reservations distinctly and closes', async () => {
  jest.mocked(readBedOccupancy).mockResolvedValue({
    branchId,
    on: '2026-10-26',
    room: {
      id: stayId,
      label: '101',
      roomTypeId: stayId,
      roomTypeName: 'Standard',
      status: 'active',
    },
    bed: { id: bedId, label: 'A', ordinal: 1, status: 'active', state: 'reserved', occupant: null },
    claims: [
      {
        source: 'booking',
        bookingId: stayId,
        stayId: null,
        moveInDate: '2026-10-20',
        moveOutDate: '2026-11-20',
        wholeRoom: true,
      },
    ],
  });
  const close = jest.fn();
  await show(
    <NativeBedDetail actorId="a" branchId={branchId} bedId={bedId} on="2026-10-26" close={close} />,
  );
  expect(
    await screen.findByText(/Booking reservation \(whole room\): 2026-10-20 to 2026-11-20/),
  ).toBeTruthy();
  // CHG-048: status is one badge in the bed's colour; the chosen date shows on its own line.
  expect(screen.getByLabelText('Status: Reserved')).toBeTruthy();
  expect(screen.getByText('On 2026-10-26')).toBeTruthy();
  expect(readStaffStayRecord).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Close bed details' }));
  expect(close).toHaveBeenCalled();
});

it('STAY-002: loads older original agreement versions without duplicating accommodation history', async () => {
  const original = record.agreements[0];
  jest
    .mocked(readStaffStayRecord)
    .mockResolvedValueOnce({
      ...record,
      agreements: Array.from({ length: 50 }, (_, index) => ({
        ...original,
        id: '20000000-0000-4000-8000-' + String(52 - index).padStart(12, '0'),
        version: 52 - index,
      })),
      nextAgreementBeforeVersion: 3,
    } as never)
    .mockResolvedValue({
      ...record,
      agreements: [{ ...original, id: branchId, version: 2 }, original],
    } as never);
  await show(<NativeStayRecord actorId="a" branchId={branchId} stayId={stayId} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Older agreement versions' }));
  // Later versions are numbered; the original version shows its date alone.
  expect(await screen.findByText(/^Version 2 · From /)).toBeTruthy();
  expect(screen.getAllByText(/^From /).length).toBeGreaterThan(0);
  expect(readStaffStayRecord).toHaveBeenLastCalledWith({}, branchId, stayId, {
    beforeAgreementVersion: 3,
  });
  expect(screen.queryByRole('button', { name: 'Older agreement versions' })).toBeNull();
});
