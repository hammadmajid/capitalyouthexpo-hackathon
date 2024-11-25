import {
  branchId,
  actorId,
  typeId,
  roomId,
  seatId,
  type,
  inventory,
  typePage,
  setInventory,
} from '../../test/unit/inventory-pages.fixture';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
  readRoomTypeAmenities,
  saveInventoryRoomType,
  changeInventoryState,
  archiveInventory,
  readInventoryPrices,
} from '@hsm/api-client';
import { BranchInventory } from './branch-inventory';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listInventoryRoomTypes: vi.fn(),
  listInventoryRooms: vi.fn(),
  listInventoryBeds: vi.fn(),
  readRoomTypeAmenities: vi.fn(),
  saveInventoryRoomType: vi.fn(),
  createInventoryRoom: vi.fn(),
  createInventoryBed: vi.fn(),
  changeInventoryState: vi.fn(),
  archiveInventory: vi.fn(),
  readInventoryPrices: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  setInventory(inventory);
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  return {
    ...render(
      <QueryClientProvider client={cache}>
        <BranchInventory actorId={actorId} branchId={branchId} />
      </QueryClientProvider>,
    ),
    cache,
  };
}
it('ACC-004: inventory and exact prices come from the authorized branch', async () => {
  show();
  expect(await screen.findByRole('heading', { name: 'Two beds' })).toBeDefined();
  expect(listInventoryRoomTypes).toHaveBeenCalledWith({}, branchId, { limit: 20 });
  expect(screen.getByText(/Bed: PKR 18,000.01/)).toBeDefined();
  expect(await screen.findByText('Bed A · Number 1 · active')).toBeDefined();
  expect(listInventoryRooms).toHaveBeenCalledWith({}, branchId, typeId, { limit: 20 });
  expect(listInventoryBeds).toHaveBeenCalledWith({}, branchId, roomId, { limit: 20 });
});
it('PROP / RPT-001 / AUD-010: physical inventory exposes actual property management and per-room location controls', async () => {
  show();
  await screen.findByText('Bed A · Number 1 · active');
  expect(screen.getByRole('button', { name: 'Manage buildings and floors' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Room 101 location' })).toBeDefined();
});
it('BKG-004: mounted inventory can open dated prices without treating its own navigation lock as lost access', async () => {
  vi.mocked(readInventoryPrices).mockResolvedValue({
    branchId,
    roomTypeId: typeId,
    data: [],
    nextCursor: null,
  });
  show();
  await screen.findByText('Bed A · Number 1 · active');
  const open = screen.getByRole('button', { name: 'Dated prices and history for Two beds' });
  await waitFor(() => expect(open).toHaveProperty('disabled', false));
  fireEvent.click(open);
  await screen.findByText(/No dated versions/);
  expect(screen.getByRole('button', { name: 'Publish dated price' })).toHaveProperty(
    'disabled',
    false,
  );
});
it('ACC-004: a Manager without editing grants sees no create, pricing or archival controls', async () => {
  vi.mocked(listInventoryRoomTypes).mockResolvedValue(
    typePage({
      ...inventory,
      permissions: [],
      canConfigureManagers: false,
    }),
  );
  show();
  await screen.findByRole('heading', { name: 'Two beds' });
  expect(screen.queryByRole('button', { name: 'Create room type' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Duplicate rooms' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive room 101' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Two beds' })).toBeNull();
});
it('ACC-004: inventory-only grant permits physical work but never price edits or type archival', async () => {
  vi.mocked(listInventoryRoomTypes).mockResolvedValue(
    typePage({
      ...inventory,
      permissions: ['inventory_edit'],
    }),
  );
  show();
  await screen.findByRole('heading', { name: 'Two beds' });
  expect(screen.getByRole('button', { name: 'Add room' }).matches(':disabled')).toBe(false);
  expect(screen.queryByRole('button', { name: 'Edit Two beds' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive Two beds' })).toBeNull();
});
it('ACC-001/004: a failed archival retains the reason and command key for retry', async () => {
  vi.mocked(archiveInventory).mockRejectedValue(new Error('Interrupted'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Archive bed A' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Retired bed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archival' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archival' }));
  await waitFor(() => expect(archiveInventory).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(archiveInventory).mock.calls;
  expect(calls[0]?.slice(0, 5)).toEqual([{}, branchId, 'seat', seatId, 'Retired bed']);
  expect(calls[0]?.[5]).toBe(calls[1]?.[5]);
});
it('ACC-001: status remains server-owned while a command is pending', async () => {
  let resolve: ((result: { id: string; branchId: string; kind: 'room' }) => void) | undefined;
  vi.mocked(changeInventoryState).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Room 101 availability' }));
  fireEvent.change(screen.getByLabelText('New availability'), { target: { value: 'maintenance' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Scheduled work' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));
  await waitFor(() => expect(changeInventoryState).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('heading', { name: 'Room 101 · active' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Saving…' }).matches(':disabled')).toBe(true);
  setInventory({
    ...inventory,
    rooms: inventory.rooms.map((room) => ({ ...room, status: 'maintenance' as const })),
  });
  resolve?.({ id: roomId, branchId, kind: 'room' });
  expect(await screen.findByRole('heading', { name: 'Room 101 · maintenance' })).toBeDefined();
});
it('SEC-003 / ACC-004: a branch change clears the previous physical edit form', async () => {
  const mounted = show(),
    next = randomUUID();
  fireEvent.click(await screen.findByRole('button', { name: 'Archive room 101' }));
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Previous branch reason' },
  });
  vi.mocked(listInventoryRoomTypes).mockResolvedValue(
    typePage(
      {
        roomTypes: [],
        rooms: [],
        permissions: [],
        canConfigureManagers: false,
      },
      next,
    ),
  );
  mounted.rerender(
    <QueryClientProvider client={mounted.cache}>
      <BranchInventory actorId={actorId} branchId={next} />
    </QueryClientProvider>,
  );
  await screen.findByText('No room types have been created for this branch.');
  expect(screen.queryByDisplayValue('Previous branch reason')).toBeNull();
  expect(listInventoryRoomTypes).toHaveBeenLastCalledWith({}, next, { limit: 20 });
});
it('ACC-004: loading failure is distinct from an empty inventory and can be retried', async () => {
  vi.mocked(listInventoryRoomTypes)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(
      typePage({ roomTypes: [], rooms: [], permissions: [], canConfigureManagers: false }),
    );
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry inventory' }));
  expect(await screen.findByText('No room types have been created for this branch.')).toBeDefined();
});

it('BKG-004: editing prices calls the exact scoped room-type command and waits for commit', async () => {
  vi.mocked(saveInventoryRoomType).mockResolvedValue({ id: typeId, branchId, kind: 'room_type' });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Two beds' }));
  fireEvent.change(screen.getByLabelText('Monthly bed rent (Rs)'), {
    target: { value: '19000.01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  await waitFor(() =>
    expect(saveInventoryRoomType).toHaveBeenCalledWith(
      {},
      branchId,
      {
        name: 'Two beds',
        inventoryMode: 'both',
        capacity: 2,
        bedMonthlyRentPaisa: 1900001,
        roomMonthlyRentPaisa: 3200000,
        depositPaisa: 0,
        fees: [],
      },
      expect.any(String),
      typeId,
    ),
  );
  await waitFor(() => expect(screen.queryByLabelText('Monthly bed rent (Rs)')).toBeNull());
});

it('BKG-004: an inventory refresh outage must retain the failed price edit for retry', async () => {
  vi.mocked(saveInventoryRoomType).mockRejectedValue(new Error('Interrupted'));
  vi.mocked(listInventoryRoomTypes)
    .mockResolvedValueOnce(typePage(inventory))
    .mockRejectedValue(new Error('Offline'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Two beds' }));
  fireEvent.change(screen.getByLabelText('Monthly bed rent (Rs)'), {
    target: { value: '19000.01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  await screen.findByRole('button', { name: 'Retry inventory' });
  expect(screen.getByLabelText('Monthly bed rent (Rs)')).toHaveProperty('value', '19,000.01');
  expect(screen.getByRole('button', { name: 'Save room type' }).matches(':disabled')).toBe(true);
});

it('SEC-003 / ACC-004: revoked access hides the stale price form even if cached inventory remains', async () => {
  const denied = new ApiFailure({
    type: 'https://api.example.test/problem',
    title: 'Denied',
    status: 403,
    code: 'FORBIDDEN',
    detail: 'Unavailable',
    traceId: 'fixture',
  });
  vi.mocked(saveInventoryRoomType).mockRejectedValue(denied);
  vi.mocked(listInventoryRoomTypes)
    .mockResolvedValueOnce(typePage(inventory))
    .mockRejectedValue(denied);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Two beds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  await screen.findByRole('button', { name: 'Retry inventory' });
  expect(screen.queryByLabelText('Monthly bed rent (Rs)')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add room' })).toBeNull();
});
it('BKG-004: a room type removed during a failed edit cannot turn that edit into an apparent creation', async () => {
  vi.mocked(saveInventoryRoomType).mockRejectedValue(new Error('Unavailable'));
  vi.mocked(listInventoryRoomTypes)
    .mockResolvedValueOnce(typePage(inventory))
    .mockResolvedValue(
      typePage({
        roomTypes: [],
        rooms: [],
        permissions: ['inventory_edit', 'pricing_edit'],
        canConfigureManagers: true,
      }),
    );
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Two beds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  await screen.findByText('No room types have been created for this branch.');
  expect(screen.queryByRole('button', { name: 'Save room type' })).toBeNull();
});

it('ROOM-002 / ACC-004: active named room types lazily open their exact scoped amenity state', async () => {
  vi.mocked(readRoomTypeAmenities).mockResolvedValue({
    branchId,
    roomTypeId: typeId,
    version: 'a'.repeat(64),
    canEdit: false,
    amenities: [{ code: 'wifi', name: 'Wi-Fi', isActive: true }],
  });
  show();
  const button = await screen.findByRole('button', { name: 'View amenities for Two beds' });
  expect(readRoomTypeAmenities).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(await screen.findByRole('heading', { name: 'Amenities for Two beds' })).toBeDefined();
  expect(readRoomTypeAmenities).toHaveBeenCalledWith({}, branchId, typeId);
  expect(screen.getByText('Wi-Fi')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Edit room amenities' })).toBeNull();
});

it('ROOM-002: archived room types do not expose an active amenity editor entry point', async () => {
  vi.mocked(listInventoryRoomTypes).mockResolvedValue(
    typePage({
      ...inventory,
      roomTypes: [{ ...type, archivedAt: '2026-10-17T00:00:00Z' }],
    }),
  );
  show();
  await screen.findByRole('heading', { name: 'Two beds — Archived' });
  expect(screen.queryByRole('button', { name: 'View amenities for Two beds' })).toBeNull();
  expect(readRoomTypeAmenities).not.toHaveBeenCalled();
});
