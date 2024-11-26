jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import {
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
  readBranchInventory,
} from '@hsm/api-client';
import { actorClient, client } from '../lib/runtime';
import { NativeInventory } from './native-inventory';
import {
  actorId,
  branchId,
  typeId,
  roomId,
  seatId,
  inventory,
  inventoryRoom,
  typePage,
  setInventory,
} from '../../test/unit/inventory-pages.fixture';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '019a1234-1234-7123-8123-123456789ac4' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  listInventoryRoomTypes: jest.fn(),
  listInventoryRooms: jest.fn(),
  listInventoryBeds: jest.fn(),
  readBranchInventory: jest.fn(),
}));
const nextType = '019a1234-1234-7123-8123-123456789ac1',
  nextRoom = '019a1234-1234-7123-8123-123456789ac2',
  nextSeat = '019a1234-1234-7123-8123-123456789ac3';
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(actorClient).mockResolvedValue(client);
  setInventory(inventory);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => cache.clear());
async function show() {
  await render(
    <QueryClientProvider client={cache}>
      <NativeInventory actorId={actorId} branchId={branchId} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'View rooms and beds' }));
  await screen.findByText('A · #1');
  return user;
}
function cursor(input: unknown): unknown {
  return input && typeof input === 'object' ? Reflect.get(input, 'cursor') : undefined;
}
test('PROP-001: Operations keeps daily availability but no room creation tools', async () => {
  await show();
  // Rooms are added, duplicated and imported in Hostel Setup, not in Operations.
  for (const name of ['Create inventory', 'Duplicate rooms', 'Import inventory CSV'])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(screen.getByRole('button', { name: 'Change room 101 availability' })).toBeVisible();
});
function extraType() {
  const initial = inventory.roomTypes[0];
  if (!initial) throw new Error('Missing fixture type');
  const addedType = { ...initial, id: nextType, name: 'Garden rooms' };
  const addedRoom = {
    ...inventoryRoom(),
    id: nextRoom,
    roomTypeId: nextType,
    label: '202',
    seats: [
      {
        id: nextSeat,
        roomId: nextRoom,
        label: 'Garden A',
        ordinal: 1,
        status: 'active' as const,
        archivedAt: null,
      },
    ],
  };
  const both = {
    ...inventory,
    roomTypes: [...inventory.roomTypes, addedType],
    rooms: [...inventory.rooms, addedRoom],
  };
  setInventory(both);
  return { addedType, both };
}
test('ROOM-002 / ACC-004: selected native children are bounded and use the verified actor, exact type and room', async () => {
  extraType();
  const user = await show();
  expect(readBranchInventory).not.toHaveBeenCalled();
  expect(listInventoryRooms).toHaveBeenCalledTimes(1);
  expect(listInventoryBeds).toHaveBeenCalledTimes(1);
  await user.press(screen.getByRole('button', { name: 'View rooms for Garden rooms' }));
  expect(await screen.findByText('Garden A · #1')).toBeVisible();
  expect(screen.queryByText('A · #1')).toBeNull();
  expect(listInventoryRooms).toHaveBeenLastCalledWith(client, branchId, nextType, { limit: 20 });
  expect(listInventoryBeds).toHaveBeenLastCalledWith(client, branchId, nextRoom, { limit: 20 });
  expect(jest.mocked(actorClient).mock.calls.every((call) => call[0] === actorId)).toBe(true);
});
test('ROOM-002: native type cursor and first-page navigation preserve current parent selection', async () => {
  const extra = extraType();
  jest
    .mocked(listInventoryRoomTypes)
    .mockImplementation(async (_client, _branch, input) =>
      cursor(input) === typeId
        ? typePage({ ...extra.both, roomTypes: [extra.addedType] })
        : { ...typePage(inventory), nextCursor: typeId },
    );
  const user = await show();
  await user.press(screen.getByRole('button', { name: 'Next room type page' }));
  await screen.findByText('Garden A · #1');
  expect(listInventoryRoomTypes).toHaveBeenLastCalledWith(client, branchId, {
    limit: 20,
    cursor: typeId,
  });
  await user.press(screen.getByRole('button', { name: 'First room type page' }));
  expect(await screen.findByText('A · #1')).toBeVisible();
});
test('ROOM-002: native room pages reset the selected bed and use the exact type cursor', async () => {
  const addedRoom = {
    ...inventoryRoom(),
    id: nextRoom,
    label: '303',
    seats: [
      {
        id: nextSeat,
        roomId: nextRoom,
        label: 'C',
        ordinal: 1,
        status: 'active' as const,
        archivedAt: null,
      },
    ],
  };
  setInventory({ ...inventory, rooms: [...inventory.rooms, addedRoom] });
  jest.mocked(listInventoryRooms).mockImplementation(async (_client, _branch, parent, input) => ({
    ...typePage(inventory),
    roomTypeId: parent,
    data: [
      {
        id: cursor(input) ? nextRoom : roomId,
        branchId,
        roomTypeId: typeId,
        label: cursor(input) ? '303' : '101',
        status: 'active',
        archivedAt: null,
      },
    ],
    nextCursor: cursor(input) ? null : roomId,
  }));
  const user = await show();
  await user.press(screen.getByRole('button', { name: 'Next room page' }));
  expect(await screen.findByText('C · #1')).toBeVisible();
  expect(listInventoryRooms).toHaveBeenLastCalledWith(client, branchId, typeId, {
    limit: 20,
    cursor: roomId,
  });
  expect(listInventoryBeds).toHaveBeenLastCalledWith(client, branchId, nextRoom, { limit: 20 });
  await user.press(screen.getByRole('button', { name: 'First room page' }));
  expect(await screen.findByText('A · #1')).toBeVisible();
  expect(listInventoryRooms).toHaveBeenLastCalledWith(client, branchId, typeId, { limit: 20 });
});
test('ROOM-002: native bed pages retain labels, stable ordinal and selected room identity', async () => {
  jest.mocked(listInventoryBeds).mockImplementation(async (_client, _branch, parent, input) => ({
    ...typePage(inventory),
    roomId: parent,
    data: [
      {
        id: cursor(input) ? nextSeat : seatId,
        roomId,
        label: cursor(input) ? 'B' : 'A',
        ordinal: cursor(input) ? 2 : 1,
        status: 'active',
        archivedAt: null,
      },
    ],
    nextCursor: cursor(input) ? null : seatId,
  }));
  const user = await show();
  await user.press(screen.getByRole('button', { name: 'Next bed page' }));
  expect(await screen.findByText('B · #2')).toBeVisible();
  expect(listInventoryBeds).toHaveBeenLastCalledWith(client, branchId, roomId, {
    limit: 20,
    cursor: seatId,
  });
  await user.press(screen.getByRole('button', { name: 'First bed page' }));
  expect(await screen.findByText('A · #1')).toBeVisible();
  expect(listInventoryBeds).toHaveBeenLastCalledWith(client, branchId, roomId, { limit: 20 });
});
test('ACC-004: current child permissions restrict stale root editing grants', async () => {
  jest.mocked(listInventoryBeds).mockResolvedValue({
    branchId,
    roomId,
    permissions: [],
    canConfigureManagers: false,
    data: inventoryRoom().seats,
    nextCursor: null,
  });
  await show();
  expect(screen.queryByRole('button', { name: 'Change room 101 availability' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Change bed A in room 101' })).toBeNull();
});
test('ROOM-004: an availability selection blocks paging until explicitly discarded', async () => {
  jest
    .mocked(listInventoryRoomTypes)
    .mockResolvedValue({ ...typePage(inventory), nextCursor: typeId });
  const user = await show();
  await user.press(screen.getByRole('button', { name: 'Change room 101 availability' }));
  await user.type(screen.getByLabelText('Inventory availability reason'), 'Keep this draft');
  expect(screen.getByRole('button', { name: 'Next room type page' })).toBeDisabled();
  expect(screen.getByLabelText('Inventory availability reason')).toHaveDisplayValue(
    'Keep this draft',
  );
  await user.press(screen.getByRole('button', { name: 'Keep availability unchanged' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Next room type page' })).not.toBeDisabled(),
  );
});
test('ROOM-002: failed native next-page read is not an empty branch and permits explicit first-page recovery', async () => {
  jest.mocked(listInventoryRoomTypes).mockImplementation(async (_client, _branch, input) => {
    if (cursor(input)) throw new Error('Offline');
    return { ...typePage(inventory), nextCursor: typeId };
  });
  const user = await show();
  await user.press(screen.getByRole('button', { name: 'Next room type page' }));
  await screen.findAllByRole('alert');
  expect(screen.queryByText('No room types yet')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Restore inventory first pages' }));
  expect(await screen.findByText('A · #1')).toBeVisible();
});
