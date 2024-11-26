import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  ClientFailure,
  readInventoryPrices,
  scheduleInventoryPrice,
} from '@hsm/api-client';
import { NativeInventoryPricing } from './inventory-pricing';
import { NativeInventoryNavigationProvider } from './native-inventory-navigation';
import { dateButton, pickDate } from '../test-utils/pick-date';
import { pullToRefresh } from '../test-utils/pull-refresh';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readInventoryPrices: jest.fn(),
  scheduleInventoryPrice: jest.fn(),
}));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000006' }));
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002',
  typeId = '10000000-0000-4000-8000-000000000003';
const type = {
  id: typeId,
  name: 'Twin beds',
  capacity: 2,
  inventoryMode: 'both' as const,
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [{ code: 'mess' as const, cadence: 'monthly' as const, amountPaisa: 100001 }],
};
const history = { branchId, roomTypeId: typeId, data: [], nextCursor: null };
const caches: QueryClient[] = [];
function latestCache() {
  const cache = caches.at(-1);
  if (!cache) throw new Error('Nothing mounted');
  return cache;
}
beforeEach(() => {
  jest.mocked(readInventoryPrices).mockReset().mockResolvedValue(history);
  jest.mocked(scheduleInventoryPrice).mockReset().mockResolvedValue({
    id: actorId,
    branchId,
    roomTypeId: typeId,
    effectiveFrom: '2026-11-01',
    bedMonthlyRentPaisa: 1900001,
    roomMonthlyRentPaisa: 3200000,
    depositPaisa: 0,
    fees: type.fees,
    createdAt: '2026-10-25T10:00:00.000Z',
  });
});
afterEach(async () => {
  await cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
async function mount(canEdit = true, unavailable = false) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  return render(
    <QueryClientProvider client={cache}>
      <NativeInventoryNavigationProvider>
        <NativeInventoryPricing
          actorId={actorId}
          branchId={branchId}
          type={type}
          canEdit={canEdit}
          unavailable={unavailable}
          blocked={false}
        />
      </NativeInventoryNavigationProvider>
    </QueryClientProvider>,
  );
}
async function open() {
  await fireEvent.press(
    screen.getByRole('button', { name: 'Dated prices and history for Twin beds' }),
  );
  await screen.findByText('No price changes yet');
}
async function edit() {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Change rent' }));
  await pickDate('Starts on', '2026-11-01');
  await fireEvent.changeText(screen.getByLabelText('Monthly bed rent (Rs)'), '19000.01');
}
it('BKG-004: native publication uses an explicit date, exact paisa and unchanged disclosed fees', async () => {
  await mount();
  await edit();
  await fireEvent.press(screen.getByRole('button', { name: 'Save rent' }));
  await screen.findByText('Rent saved.');
  expect(scheduleInventoryPrice).toHaveBeenCalledWith(
    {},
    branchId,
    typeId,
    {
      effectiveFrom: '2026-11-01',
      bedMonthlyRentPaisa: 1900001,
      roomMonthlyRentPaisa: 3200000,
      depositPaisa: 0,
      fees: type.fees,
    },
    expect.any(String),
  );
});
it('BKG-004: missing date and malformed fees fail before publishing', async () => {
  await mount();
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Change rent' }));
  // The date starts as today; clearing it must block publishing.
  await fireEvent.press(screen.getByRole('button', { name: 'Clear Starts on' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save rent' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(scheduleInventoryPrice).not.toHaveBeenCalled();
  await pickDate('Starts on', '2026-11-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Add disclosed fee' }));
  await fireEvent.changeText(screen.getByLabelText('Fee 2 amount (Rs)'), '500');
  await fireEvent.press(screen.getByRole('button', { name: 'Save rent' }));
  expect(scheduleInventoryPrice).not.toHaveBeenCalled();
});
it('BKG-004 / ACC-004: unknown results retain the original price and prevent replacement or close', async () => {
  jest
    .mocked(scheduleInventoryPrice)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  await mount();
  await edit();
  await fireEvent.press(screen.getByRole('button', { name: 'Save rent' }));
  const retry = await screen.findByRole('button', { name: 'Retry original price publication' });
  expect(dateButton('Starts on').props.accessibilityState).toMatchObject({ disabled: true });
  expect(
    screen.getByRole('button', { name: 'Close price history' }).props.accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(retry);
  await screen.findByText('Rent saved.');
  expect(jest.mocked(scheduleInventoryPrice).mock.calls[1]).toEqual(
    jest.mocked(scheduleInventoryPrice).mock.calls[0],
  );
});
it('ACC-004: failed refresh removes cached historical price facts', async () => {
  jest.mocked(readInventoryPrices).mockResolvedValue({
    ...history,
    data: [
      {
        id: actorId,
        branchId,
        roomTypeId: typeId,
        effectiveFrom: '2026-11-01',
        bedMonthlyRentPaisa: 1900001,
        roomMonthlyRentPaisa: null,
        depositPaisa: 0,
        fees: [],
        createdAt: '2026-10-25T10:00:00.000Z',
      },
    ],
  });
  await mount();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Dated prices and history for Twin beds' }),
  );
  await screen.findByText('Effective 2026-11-01');
  jest.mocked(readInventoryPrices).mockRejectedValueOnce(new Error('Unavailable'));
  await pullToRefresh(latestCache());
  await screen.findByText('Price history unavailable.');
  await waitFor(() => expect(screen.queryByText('Effective 2026-11-01')).toBeNull());
});
it('ACC-004 / BKG-004: denial after an unknown result does not discard or strand the original retry', async () => {
  jest
    .mocked(scheduleInventoryPrice)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockRejectedValueOnce(
      new ApiFailure({
        type: 'about:blank',
        title: 'Denied',
        detail: 'Denied',
        status: 403,
        code: 'FORBIDDEN',
        traceId: actorId,
      }),
    );
  await mount();
  await edit();
  await fireEvent.press(screen.getByRole('button', { name: 'Save rent' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Retry original price publication' }),
  );
  await screen.findByText('Price history unavailable.');
  const retry = screen.getByRole('button', { name: 'Retry original price publication' });
  expect(retry.props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(retry);
  await screen.findByText('Rent saved.');
  expect(jest.mocked(scheduleInventoryPrice).mock.calls[2]).toEqual(
    jest.mocked(scheduleInventoryPrice).mock.calls[0],
  );
});
it('ACC-004: unknown publication allows read-only refresh, outage recovery and original-command retry', async () => {
  jest
    .mocked(scheduleInventoryPrice)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  await mount();
  await edit();
  await fireEvent.press(screen.getByRole('button', { name: 'Save rent' }));
  await screen.findByRole('button', { name: 'Retry original price publication' });
  // Pull-to-refresh still reads while an unresolved save is open.
  jest.mocked(readInventoryPrices).mockRejectedValueOnce(new Error('Unavailable'));
  await pullToRefresh(latestCache());
  await screen.findByText('Price history unavailable.');
  expect(
    screen.getByRole('button', { name: 'Retry original price publication' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await pullToRefresh(latestCache());
  await screen.findByText('No price changes yet');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry original price publication' }));
  await screen.findByText('Rent saved.');
  expect(jest.mocked(scheduleInventoryPrice).mock.calls[1]).toEqual(
    jest.mocked(scheduleInventoryPrice).mock.calls[0],
  );
});
it('ACC-004: read-only management has no publication action; unavailable parent blocks opening', async () => {
  await mount(false);
  await open();
  expect(screen.queryByRole('button', { name: 'Change rent' })).toBeNull();
  await cleanup();
  await mount(true, true);
  expect(
    screen.getByRole('button', { name: 'Dated prices and history for Twin beds' }).props
      .accessibilityState.disabled,
  ).toBe(true);
});
