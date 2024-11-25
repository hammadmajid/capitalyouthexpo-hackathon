import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  ClientFailure,
  readInventoryPrices,
  scheduleInventoryPrice,
} from '@hsm/api-client';
import { InventoryPricing } from './inventory-pricing';
import { InventoryNavigationProvider } from './inventory-navigation';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryPrices: vi.fn(),
  scheduleInventoryPrice: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
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
beforeEach(() => {
  vi.mocked(readInventoryPrices).mockReset().mockResolvedValue(history);
  vi.mocked(scheduleInventoryPrice).mockReset().mockResolvedValue({
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
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function mount(canEdit = true, unavailable = false) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  return render(
    <QueryClientProvider client={cache}>
      <InventoryNavigationProvider>
        <InventoryPricing
          actorId={actorId}
          branchId={branchId}
          type={type}
          canEdit={canEdit}
          unavailable={unavailable}
          blocked={false}
        />
      </InventoryNavigationProvider>
    </QueryClientProvider>,
  );
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Dated prices and history for Twin beds' }));
  await screen.findByText(/No dated versions/);
}
async function edit() {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Publish dated price' }));
  fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Monthly bed rent (Rs)'), {
    target: { value: '19000.01' },
  });
}
it('BKG-004: mounted dated publication retains exact paisa, existing fees and an explicit effective date', async () => {
  mount();
  await edit();
  expect(screen.getByLabelText('Room type name')).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Publish price version' }));
  await screen.findByText('Dated price version published.');
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
it('BKG-004: missing date and invalid decimals prevent a request', async () => {
  mount();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Publish dated price' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish price version' }));
  expect(screen.getByText('Enter a valid effective date.')).toBeDefined();
  expect(scheduleInventoryPrice).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Monthly bed rent (Rs)'), {
    target: { value: '19000.001' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publish price version' }));
  expect(scheduleInventoryPrice).not.toHaveBeenCalled();
});
it('ACC-004 / BKG-004: unknown outcome locks replacement, edit and close; retry reuses exact date/body/key', async () => {
  vi.mocked(scheduleInventoryPrice).mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  mount();
  await edit();
  fireEvent.click(screen.getByRole('button', { name: 'Publish price version' }));
  const retry = await screen.findByRole('button', { name: 'Retry original price publication' });
  expect(screen.getByLabelText('Effective date')).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Close price history' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(retry);
  await screen.findByText('Dated price version published.');
  expect(vi.mocked(scheduleInventoryPrice).mock.calls[1]).toEqual(
    vi.mocked(scheduleInventoryPrice).mock.calls[0],
  );
});
it('ACC-004: a refresh failure removes all cached price facts and disables publication', async () => {
  vi.mocked(readInventoryPrices).mockResolvedValue({
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
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Dated prices and history for Twin beds' }));
  await screen.findByText('Effective 2026-11-01');
  vi.mocked(readInventoryPrices).mockRejectedValueOnce(new Error('Private source unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh price history' }));
  await screen.findByText('Price history unavailable.');
  await waitFor(() => expect(screen.queryByText('Effective 2026-11-01')).toBeNull());
  expect(screen.getByRole('button', { name: 'Publish dated price' })).toHaveProperty(
    'disabled',
    true,
  );
});
it('ACC-004 / BKG-004: a denial after an unknown outcome preserves retry of the original command', async () => {
  vi.mocked(scheduleInventoryPrice)
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
  mount();
  await edit();
  fireEvent.click(screen.getByRole('button', { name: 'Publish price version' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry original price publication' }));
  await screen.findByText('Price history unavailable.');
  const retry = screen.getByRole('button', { name: 'Retry original price publication' });
  expect(retry).toHaveProperty('disabled', false);
  fireEvent.click(retry);
  await screen.findByText('Dated price version published.');
  expect(vi.mocked(scheduleInventoryPrice).mock.calls[2]).toEqual(
    vi.mocked(scheduleInventoryPrice).mock.calls[0],
  );
});
it('ACC-004: unknown publication permits read-only history refresh and recovery without replacing its intent', async () => {
  vi.mocked(scheduleInventoryPrice).mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  mount();
  await edit();
  fireEvent.click(screen.getByRole('button', { name: 'Publish price version' }));
  await screen.findByRole('button', { name: 'Retry original price publication' });
  const refresh = screen.getByRole('button', { name: 'Refresh price history' });
  expect(refresh).toHaveProperty('disabled', false);
  vi.mocked(readInventoryPrices).mockRejectedValueOnce(new Error('Unavailable'));
  fireEvent.click(refresh);
  await screen.findByText('Price history unavailable.');
  expect(screen.getByRole('button', { name: 'Retry original price publication' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(refresh);
  await screen.findByText(/No dated versions/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry original price publication' }));
  await screen.findByText('Dated price version published.');
  expect(vi.mocked(scheduleInventoryPrice).mock.calls[1]).toEqual(
    vi.mocked(scheduleInventoryPrice).mock.calls[0],
  );
});
it('ACC-004: read-only management can inspect history but cannot publish; unavailable parent blocks opening', async () => {
  mount(false);
  await open();
  expect(screen.queryByRole('button', { name: 'Publish dated price' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close price history' }));
  cleanup();
  mount(true, true);
  expect(
    screen.getByRole('button', { name: 'Dated prices and history for Twin beds' }),
  ).toHaveProperty('disabled', true);
});
