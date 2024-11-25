import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiFailure, listInventoryRoomTypes, readRoomTypeAmenities } from '@hsm/api-client';
import { BranchInventory } from './branch-inventory';
import {
  actorId,
  branchId,
  typeId,
  inventory,
  typePage,
  setInventory,
} from '../../test/unit/inventory-pages.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listInventoryRoomTypes: vi.fn(),
  listInventoryRooms: vi.fn(),
  listInventoryBeds: vi.fn(),
  readRoomTypeAmenities: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./listing-settings', async () => {
  const { useState } = await import('react');
  const { useInventoryNavigationLock } = await import('./inventory-navigation');
  return {
    ListingSettings: function RetainedSettings() {
      const [open, setOpen] = useState(false);
      useInventoryNavigationLock(open);
      return (
        <div>
          <input aria-label="Retained independent draft" defaultValue="" />
          <button onClick={() => setOpen(!open)}>
            {open ? 'Close retained settings' : 'Open retained settings'}
          </button>
        </div>
      );
    },
  };
});
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  setInventory(inventory);
  vi.mocked(listInventoryRoomTypes).mockResolvedValue({
    ...typePage(inventory),
    nextCursor: typeId,
  });
  vi.mocked(readRoomTypeAmenities).mockResolvedValue({
    branchId,
    roomTypeId: typeId,
    version: 'a'.repeat(64),
    canEdit: false,
    amenities: [],
  });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
async function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <BranchInventory actorId={actorId} branchId={branchId} />
    </QueryClientProvider>,
  );
  await screen.findByText('Bed A · Number 1 · active');
}
it('ROOM-002: an initial type-settings read failure cannot trap paging with no close control', async () => {
  vi.mocked(readRoomTypeAmenities).mockRejectedValue(new Error('Offline'));
  await show();
  fireEvent.click(screen.getByRole('button', { name: 'View amenities for Two beds' }));
  await screen.findByRole('button', { name: 'Retry room amenities' });
  expect(screen.queryByRole('button', { name: 'Close room amenities' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Next room type page' }).matches(':disabled')).toBe(
    false,
  );
});
it('ACC-004: definitive type-settings denial releases navigation while hiding cached settings', async () => {
  await show();
  fireEvent.click(screen.getByRole('button', { name: 'View amenities for Two beds' }));
  await screen.findByRole('heading', { name: 'Amenities for Two beds' });
  vi.mocked(readRoomTypeAmenities).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.test/problem',
      title: 'Unavailable',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Unavailable',
      traceId: 'fixture',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh room amenity access' }));
  await screen.findByRole('button', { name: 'Retry room amenity access' });
  expect(screen.queryByRole('button', { name: 'Close room amenities' })).toBeNull();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Next room type page' }).matches(':disabled')).toBe(
      false,
    ),
  );
});
it('ROOM-002: first-page recovery also respects a retained independent settings lock', async () => {
  vi.mocked(listInventoryRoomTypes).mockImplementation(async (_client, _branch, input) => {
    if (input && typeof input === 'object' && Reflect.get(input, 'cursor'))
      throw new Error('Offline');
    return { ...typePage(inventory), nextCursor: typeId };
  });
  await show();
  fireEvent.click(screen.getByRole('button', { name: 'Next room type page' }));
  await screen.findByRole('button', { name: 'Restore inventory first pages' });
  fireEvent.change(screen.getByLabelText('Retained independent draft'), {
    target: { value: 'Retain this' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open retained settings' }));
  expect(
    screen.getByRole('button', { name: 'Restore inventory first pages' }).matches(':disabled'),
  ).toBe(true);
  expect(screen.getByDisplayValue('Retain this')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Close retained settings' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Restore inventory first pages' }).matches(':disabled'),
    ).toBe(false),
  );
});
