jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readRentBoard } from '@hsm/api-client';
import { NativeRentBoard } from './rent-board';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readRentBoard: jest.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stayId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const page = {
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
      state: 'issued',
      pendingProofs: 0,
      invoices: [
        {
          invoiceId: stayId,
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
        },
      ],
    },
  ],
  nextCursor: stayId,
};
async function view() {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <NativeRentBoard actorId="a" branchId={branchId} />
    </QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());
it('RB-001/002: neutral issued state, amounts, month selection and paging', async () => {
  jest.mocked(readRentBoard).mockResolvedValue(page as never);
  await view();
  expect(readRentBoard).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'View Rent Board' }));
  expect(
    await screen.findByLabelText('Resident One · Room 101, Bed A: Issued (not yet overdue)'),
  ).toBeTruthy();
  expect(
    screen.getByText(/INV-1: due 2026-11-05 · outstanding PKR 18,000 of PKR 18,000/),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Next Stays' }));
  await waitFor(() =>
    expect(readRentBoard).toHaveBeenLastCalledWith({}, branchId, { cursor: stayId }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'First Stays' }));
  const input = screen.getByLabelText('Billing month (YYYY-MM, blank for current)');
  await fireEvent.changeText(input, '2026-13');
  expect(screen.getByText('Enter the month as YYYY-MM.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Show billing month' })).toBeDisabled();
  await fireEvent.changeText(input, '2026-09');
  await fireEvent.press(screen.getByRole('button', { name: 'Show billing month' }));
  await waitFor(() =>
    expect(readRentBoard).toHaveBeenLastCalledWith({}, branchId, { month: '2026-09' }),
  );
});
it('SEC-003: failures show a safe message and the board closes', async () => {
  jest.mocked(readRentBoard).mockRejectedValue(new Error('private failure detail'));
  await view();
  await fireEvent.press(screen.getByRole('button', { name: 'View Rent Board' }));
  await waitFor(() => expect(readRentBoard).toHaveBeenCalled());
  expect(screen.queryByText(/private failure detail/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close Rent Board' }));
  expect(screen.getByRole('button', { name: 'View Rent Board' })).toBeTruthy();
});
