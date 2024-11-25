import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
  readBranchInventory,
  readRoomTypeAmenities,
} from '@hsm/api-client';
import { BranchInventory } from './branch-inventory';
import {
  actorId,
  branchId,
  typeId,
  roomId,
  seatId,
  type,
  inventory,
  typePage,
  setInventory,
} from '../../test/unit/inventory-pages.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listInventoryRoomTypes: vi.fn(),
  listInventoryRooms: vi.fn(),
  listInventoryBeds: vi.fn(),
  readBranchInventory: vi.fn(),
  readRoomTypeAmenities: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./listing-settings', () => ({
  ListingSettings: () => <input aria-label="Independent listing draft" defaultValue="" />,
}));
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  setInventory(inventory);
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  return {
    cache,
    ...render(
      <QueryClientProvider client={cache}>
        <BranchInventory actorId={actorId} branchId={branchId} />
      </QueryClientProvider>,
    ),
  };
}
function cursor(input: unknown) {
  return input && typeof input === 'object' ? Reflect.get(input, 'cursor') : undefined;
}
function withSecondType() {
  const nextTypeId = randomUUID(),
    nextRoomId = randomUUID(),
    nextSeatId = randomUUID();
  const addedType = { ...type, id: nextTypeId, name: 'Garden rooms' },
    addedRoom = {
      ...inventory.rooms[0],
      id: nextRoomId,
      branchId,
      roomTypeId: nextTypeId,
      label: '202',
      status: 'active' as const,
      archivedAt: null,
      seats: [
        {
          id: nextSeatId,
          roomId: nextRoomId,
          label: 'Garden A',
          ordinal: 1,
          status: 'active' as const,
          archivedAt: null,
        },
      ],
    };
  const both = {
    ...inventory,
    roomTypes: [type, addedType],
    rooms: [...inventory.rooms, addedRoom],
  };
  setInventory(both);
  return { nextTypeId, nextRoomId, addedType, addedRoom, both };
}
it('ROOM-002 / PERF: only selected type and room children load; switching type preserves actual labels and exact parents', async () => {
  const extra = withSecondType();
  show();
  await screen.findByText('Bed A · Number 1 · active');
  expect(listInventoryRooms).toHaveBeenCalledTimes(1);
  expect(listInventoryBeds).toHaveBeenCalledTimes(1);
  expect(readBranchInventory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View rooms for Garden rooms' }));
  expect(await screen.findByText('Bed Garden A · Number 1 · active')).toBeDefined();
  expect(screen.queryByText('Bed A · Number 1 · active')).toBeNull();
  expect(listInventoryRooms).toHaveBeenLastCalledWith({}, branchId, extra.nextTypeId, {
    limit: 20,
  });
  expect(listInventoryBeds).toHaveBeenLastCalledWith({}, branchId, extra.nextRoomId, { limit: 20 });
});
it('ROOM-002: type continuation and first-page navigation send exact cursors without fetching every type', async () => {
  const extra = withSecondType();
  vi.mocked(listInventoryRoomTypes).mockImplementation(async (_client, _branch, input) =>
    cursor(input) === typeId
      ? typePage({ ...extra.both, roomTypes: [extra.addedType] })
      : { ...typePage(inventory), nextCursor: typeId },
  );
  show();
  await screen.findByText('Bed A · Number 1 · active');
  fireEvent.click(screen.getByRole('button', { name: 'Next room type page' }));
  await screen.findByText('Bed Garden A · Number 1 · active');
  expect(listInventoryRoomTypes).toHaveBeenLastCalledWith({}, branchId, {
    limit: 20,
    cursor: typeId,
  });
  expect(screen.queryByRole('heading', { name: 'Two beds' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'First room type page' }));
  expect(await screen.findByText('Bed A · Number 1 · active')).toBeDefined();
  expect(listInventoryRoomTypes).toHaveBeenLastCalledWith({}, branchId, { limit: 20 });
});
it('ROOM-002: room continuation binds the type and automatically resets bed selection', async () => {
  const nextRoomId = randomUUID(),
    nextSeatId = randomUUID();
  const addedRoom = {
    ...inventory.rooms[0],
    id: nextRoomId,
    branchId,
    roomTypeId: typeId,
    label: '303',
    status: 'active' as const,
    archivedAt: null,
    seats: [
      {
        id: nextSeatId,
        roomId: nextRoomId,
        label: 'C',
        ordinal: 1,
        status: 'active' as const,
        archivedAt: null,
      },
    ],
  };
  setInventory({ ...inventory, rooms: [...inventory.rooms, addedRoom] });
  vi.mocked(listInventoryRooms).mockImplementation(async (_client, _branch, parent, input) => ({
    ...typePage(inventory),
    roomTypeId: parent,
    data: [
      {
        id: cursor(input) ? nextRoomId : roomId,
        branchId,
        roomTypeId: typeId,
        label: cursor(input) ? '303' : '101',
        status: 'active',
        archivedAt: null,
      },
    ],
    nextCursor: cursor(input) ? null : roomId,
  }));
  show();
  await screen.findByText('Bed A · Number 1 · active');
  fireEvent.click(screen.getByRole('button', { name: 'Next room page' }));
  expect(await screen.findByText('Bed C · Number 1 · active')).toBeDefined();
  expect(listInventoryRooms).toHaveBeenLastCalledWith({}, branchId, typeId, {
    limit: 20,
    cursor: roomId,
  });
  expect(listInventoryBeds).toHaveBeenLastCalledWith({}, branchId, nextRoomId, { limit: 20 });
});
it('ROOM-002: bed continuation preserves room identity and actual ordinals', async () => {
  const nextSeatId = randomUUID();
  vi.mocked(listInventoryBeds).mockImplementation(async (_client, _branch, parent, input) => ({
    ...typePage(inventory),
    roomId: parent,
    data: [
      {
        id: cursor(input) ? nextSeatId : seatId,
        roomId,
        label: cursor(input) ? 'B' : 'A',
        ordinal: cursor(input) ? 2 : 1,
        status: 'active',
        archivedAt: null,
      },
    ],
    nextCursor: cursor(input) ? null : seatId,
  }));
  show();
  await screen.findByText('Bed A · Number 1 · active');
  fireEvent.click(screen.getByRole('button', { name: 'Next bed page' }));
  expect(await screen.findByText('Bed B · Number 2 · active')).toBeDefined();
  expect(listInventoryBeds).toHaveBeenLastCalledWith({}, branchId, roomId, {
    limit: 20,
    cursor: seatId,
  });
  expect(screen.queryByText('Bed A · Number 1 · active')).toBeNull();
});
it('ACC-004: later current child access can restrict cached root edit authority', async () => {
  vi.mocked(listInventoryBeds).mockResolvedValue({
    branchId,
    roomId,
    permissions: [],
    canConfigureManagers: false,
    data: inventory.rooms[0]?.seats ?? [],
    nextCursor: null,
  });
  show();
  await screen.findByText('Bed A · Number 1 · active');
  expect(screen.queryByRole('button', { name: 'Create room type' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive bed A' })).toBeNull();
});
it('BKG-004: an active price draft prevents navigation until explicitly cancelled', async () => {
  vi.mocked(listInventoryRoomTypes).mockResolvedValue({
    ...typePage(inventory),
    nextCursor: typeId,
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Two beds' }));
  fireEvent.change(screen.getByLabelText('Monthly bed rent (Rs)'), {
    target: { value: '19000.01' },
  });
  const next = screen.getByRole('button', { name: 'Next room type page' });
  expect(next.matches(':disabled')).toBe(true);
  fireEvent.click(next);
  expect(listInventoryRoomTypes).toHaveBeenCalledTimes(1);
  expect(screen.getByDisplayValue('19,000.01')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
  await waitFor(() => expect(next.matches(':disabled')).toBe(false));
});
it('ROOM-002: failed next page is not an empty branch and can explicitly restore first pages', async () => {
  vi.mocked(listInventoryRoomTypes).mockImplementation(async (_client, _branch, input) => {
    if (cursor(input)) throw new Error('Offline');
    return { ...typePage(inventory), nextCursor: typeId };
  });
  show();
  await screen.findByText('Bed A · Number 1 · active');
  fireEvent.click(screen.getByRole('button', { name: 'Next room type page' }));
  await screen.findByRole('button', { name: 'Retry inventory' });
  expect(screen.queryByText('No room types have been created for this branch.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Restore inventory first pages' }));
  expect(await screen.findByText('Bed A · Number 1 · active')).toBeDefined();
});

it('ROOM-002: paging physical children does not discard an independent listing draft', async () => {
  const extra = withSecondType();
  vi.mocked(listInventoryRoomTypes).mockImplementation(async (_client, _branch, input) =>
    cursor(input) === typeId
      ? typePage({ ...extra.both, roomTypes: [extra.addedType] })
      : { ...typePage(inventory), nextCursor: typeId },
  );
  show();
  await screen.findByText('Bed A · Number 1 · active');
  fireEvent.change(screen.getByLabelText('Independent listing draft'), {
    target: { value: 'Keep listing draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next room type page' }));
  await screen.findByText('Bed Garden A · Number 1 · active');
  expect(screen.getByLabelText('Independent listing draft')).toHaveProperty(
    'value',
    'Keep listing draft',
  );
});
it('ROOM-002: an open type settings panel prevents paging until explicitly closed', async () => {
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
  show();
  await screen.findByText('Bed A · Number 1 · active');
  fireEvent.click(screen.getByRole('button', { name: 'View amenities for Two beds' }));
  await screen.findByRole('heading', { name: 'Amenities for Two beds' });
  expect(screen.getByRole('button', { name: 'Next room type page' }).matches(':disabled')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close room amenities' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Next room type page' }).matches(':disabled')).toBe(
      false,
    ),
  );
});
