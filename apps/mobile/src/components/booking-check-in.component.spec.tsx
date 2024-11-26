import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkInBooking, previewBookingCheckIn } from '@hsm/api-client';
import { BookingCheckIn, checkInBilling } from './booking-check-in';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  previewBookingCheckIn: jest.fn(),
  checkInBooking: jest.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bookingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  policyVersionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const terms = {
  policyVersionId,
  currency: 'PKR' as const,
  fees: [{ code: 'mess' as const, cadence: 'monthly' as const, amountPaisa: 300000 }],
  catalog: [],
  rentAmountPaisa: 1800000,
  depositPaisa: 0,
  policy: {} as never,
};
it('STAY-001: reviews captured terms and checks in with the first-period billing', async () => {
  jest.mocked(previewBookingCheckIn).mockResolvedValue({ branchId, bookingId, terms } as never);
  jest.mocked(checkInBooking).mockResolvedValue({
    branchId,
    bookingId,
    stayId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  } as never);
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <BookingCheckIn actorId="actor" branchId={branchId} bookingId={bookingId} />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Check in resident' }));
  expect(await screen.findByText('Rent PKR 18,000/month')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm check-in' }));
  expect(await screen.findByText(/Resident checked in/)).toBeTruthy();
  expect(checkInBooking).toHaveBeenCalledWith(
    {},
    branchId,
    bookingId,
    { policyVersionId, initialBilling: checkInBilling(terms as never) },
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  );
});
