jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
/// <reference types="jest" />
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import {
  ApiFailure,
  changeInventoryState,
  readBillingSettings,
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
  readInventoryPrices,
} from '@hsm/api-client';
import { actorClient, client } from '../lib/runtime';
import { NativeInventory } from './native-inventory';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: jest.fn() }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  changeInventoryState: jest.fn(),
  readBillingSettings: jest.fn(),
  listInventoryRoomTypes: jest.fn(),
  listInventoryRooms: jest.fn(),
  listInventoryBeds: jest.fn(),
  readInventoryPrices: jest.fn(),
}));
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  jest.mocked(actorClient).mockResolvedValue(client);
  setInventory(inventory);
  jest.mocked(changeInventoryState).mockResolvedValue({ id: roomId, branchId, kind: 'room' });
});
afterEach(() => cache.clear());
function view(props = { actorId, branchId, accessUnavailable: false }) {
  return (
    <QueryClientProvider client={cache}>
      <NativeInventory {...props} />
    </QueryClientProvider>
  );
}
async function show() {
  const mounted = await render(view()),
    user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'View rooms and beds' }));
  await screen.findByRole('header', { name: 'Branch rooms and beds' });
  return { mounted, user };
}
async function editRoom() {
  const value = await show();
  await value.user.press(screen.getByRole('button', { name: 'Change room 101 availability' }));
  await value.user.press(screen.getByRole('button', { name: 'Set maintenance' }));
  await value.user.type(screen.getByLabelText('Inventory availability reason'), 'Plumbing repair');
  return value;
}
test('BKG-004: Operations shows dated price history read-only (prices change in Hostel Setup) and blocks navigation', async () => {
  setInventory({ ...inventory, permissions: ['inventory_edit', 'pricing_edit'] });
  jest
    .mocked(readInventoryPrices)
    .mockResolvedValue({ branchId, roomTypeId: typeId, data: [], nextCursor: null });
  const { user } = await show();
  const open = await screen.findByRole('button', { name: 'Dated prices and history for Two beds' });
  await waitFor(() => expect(open).toBeEnabled());
  await user.press(open);
  await screen.findByText('No price changes yet');
  expect(screen.queryByRole('button', { name: 'Change rent' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Close rooms and beds' })).toBeDisabled();
});
const denial = new ApiFailure({
  type: 'https://example.test/problem',
  title: 'Denied',
  status: 403,
  code: 'BRANCH_FORBIDDEN',
  detail: 'Unavailable',
  traceId: 'fixture',
});

test('ACC-004: native inventory loads lazily through the bound actor and shows real labels and integer prices', async () => {
  await render(view());
  expect(listInventoryRoomTypes).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole('button', { name: 'View rooms and beds' }));
  expect(await screen.findByText('Two beds')).toBeVisible();
  expect(screen.getByText('PKR 18,000.01 / bed · month')).toBeVisible();
  expect(screen.getByText('101')).toBeVisible();
  expect(screen.getByText('A · #1')).toBeVisible();
  expect(listInventoryRoomTypes).toHaveBeenCalledWith(client, branchId, { limit: 20 });
  expect(listInventoryRooms).toHaveBeenCalledWith(client, branchId, typeId, { limit: 20 });
  expect(listInventoryBeds).toHaveBeenCalledWith(client, branchId, roomId, { limit: 20 });
  expect(actorClient).toHaveBeenCalledWith(actorId);
  expect(screen.queryByText(roomId)).toBeNull();
});
test('ACC-004: an ungranted Manager can read but cannot open availability actions', async () => {
  jest
    .mocked(listInventoryRoomTypes)
    .mockResolvedValue(typePage({ ...inventory, permissions: [] }));
  await show();
  expect(screen.queryByRole('button', { name: 'Change room 101 availability' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Duplicate rooms' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Change bed A in room 101' })).toBeNull();
  expect(changeInventoryState).not.toHaveBeenCalled();
});
test('ROOM-004: a room change requires an explicit state and reason and waits for server persistence', async () => {
  let finish: ((value: Awaited<ReturnType<typeof changeInventoryState>>) => void) | undefined;
  jest.mocked(changeInventoryState).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = await editRoom();
  await user.press(screen.getByRole('button', { name: 'Save availability' }));
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.getByRole('button', { name: 'Saving availability…' })).toBeDisabled();
  expect(changeInventoryState).toHaveBeenCalledWith(
    client,
    branchId,
    'room',
    roomId,
    { status: 'maintenance', reason: 'Plumbing repair' },
    expect.any(String),
  );
  await act(async () => {
    finish?.({ id: roomId, branchId, kind: 'room' });
  });
  expect(await screen.findByText('Saved')).toBeVisible();
});
test('ROOM-004: cancellation leaves the server unchanged', async () => {
  const { user } = await editRoom();
  await user.press(screen.getByRole('button', { name: 'Keep availability unchanged' }));
  expect(screen.queryByLabelText('Inventory availability reason')).toBeNull();
  expect(changeInventoryState).not.toHaveBeenCalled();
});
test('ROOM-004: failed identical retries preserve draft and idempotency key', async () => {
  jest.mocked(changeInventoryState).mockRejectedValue(new Error('Interrupted'));
  const { user } = await editRoom();
  await user.press(screen.getByRole('button', { name: 'Save availability' }));
  await waitFor(() => expect(changeInventoryState).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save availability' })).not.toBeDisabled(),
  );
  expect(screen.getByLabelText('Inventory availability reason')).toHaveDisplayValue(
    'Plumbing repair',
  );
  await user.press(screen.getByRole('button', { name: 'Save availability' }));
  await waitFor(() => expect(changeInventoryState).toHaveBeenCalledTimes(2));
  expect(jest.mocked(changeInventoryState).mock.calls[0]?.[5]).toBe(
    jest.mocked(changeInventoryState).mock.calls[1]?.[5],
  );
});
test.each([403, 404])(
  'SEC-003: definitive revocation (%s) hides cached private inventory and permits an explicit access retry',
  async (status) => {
    await editRoom();
    jest.mocked(listInventoryRoomTypes).mockRejectedValue(
      status === 403
        ? denial
        : new ApiFailure({
            type: 'https://example.test/problem',
            title: 'Unavailable',
            status,
            code: 'NOT_FOUND',
            detail: 'Unavailable',
            traceId: 'fixture',
          }),
    );
    await act(() =>
      cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('Two beds')).toBeNull();
    expect(screen.queryByLabelText('Inventory availability reason')).toBeNull();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  },
);
test('ACC-004: refresh outages retain the draft while disabling writes', async () => {
  await editRoom();
  jest.mocked(listInventoryRoomTypes).mockRejectedValue(new Error('Offline'));
  await act(() =>
    cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] }),
  );
  expect(await screen.findByText('Could not refresh · actions paused')).toBeVisible();
  expect(screen.getByLabelText('Inventory availability reason')).toHaveDisplayValue(
    'Plumbing repair',
  );
  expect(screen.getByRole('button', { name: 'Save availability' })).toBeDisabled();
});
test('ACC-004: parent branch access outages disable child operations', async () => {
  const { mounted } = await editRoom();
  await mounted.rerender(view({ actorId, branchId, accessUnavailable: true }));
  expect(screen.getByRole('button', { name: 'Save availability' })).toBeDisabled();
});
test('SEC-003: branch changes discard old labels, draft and pending selection', async () => {
  const { mounted } = await editRoom();
  await mounted.rerender(view({ actorId, branchId: typeId, accessUnavailable: false }));
  expect(screen.queryByText('Two beds')).toBeNull();
  expect(screen.queryByLabelText('Inventory availability reason')).toBeNull();
  expect(screen.getByRole('button', { name: 'View rooms and beds' })).toBeVisible();
});
test('ROOM-004: a removed target cannot be submitted from a retained draft', async () => {
  await editRoom();
  setInventory({ ...inventory, rooms: [] });
  await act(() =>
    cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] }),
  );
  expect(
    await screen.findByText('This inventory is no longer available for this edit.'),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Save availability' })).toBeNull();
});
test('ROOM-004: archived parent rooms hide all child bed actions', async () => {
  setInventory({
    ...inventory,
    rooms: [{ ...inventoryRoom(), archivedAt: '2026-10-17T00:00:00Z' }],
  });
  await show();
  expect(screen.queryByRole('button', { name: 'Change room 101 availability' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Change bed A in room 101' })).toBeNull();
});
test('SEC-003: changed actor binding blocks the native inventory request', async () => {
  jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
  await render(view());
  await userEvent.setup().press(screen.getByRole('button', { name: 'View rooms and beds' }));
  expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  expect(listInventoryRoomTypes).not.toHaveBeenCalled();
});

test('ROOM-004: bed edits target the actual selected child and retain a required reason', async () => {
  jest.mocked(changeInventoryState).mockResolvedValue({ id: seatId, branchId, kind: 'seat' });
  const { user } = await show();
  await user.press(screen.getByRole('button', { name: 'Change bed A in room 101' }));
  expect(screen.getByRole('button', { name: 'Save availability' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Set inactive' }));
  expect(screen.getByRole('button', { name: 'Save availability' })).toBeDisabled();
  await user.type(screen.getByLabelText('Inventory availability reason'), 'Bed repairs');
  await user.press(screen.getByRole('button', { name: 'Save availability' }));
  await waitFor(() =>
    expect(changeInventoryState).toHaveBeenCalledWith(
      client,
      branchId,
      'seat',
      seatId,
      { status: 'inactive', reason: 'Bed repairs' },
      expect.any(String),
    ),
  );
});

test('SEC-003: a late old-branch save cannot restore its cache or show success in the new scope', async () => {
  let finish: ((value: Awaited<ReturnType<typeof changeInventoryState>>) => void) | undefined;
  jest.mocked(changeInventoryState).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user, mounted } = await editRoom();
  await user.press(screen.getByRole('button', { name: 'Save availability' }));
  await mounted.rerender(view({ actorId, branchId: typeId, accessUnavailable: false }));
  cache.removeQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] });
  await act(async () => {
    finish?.({ id: roomId, branchId, kind: 'room' });
  });
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.queryByText('Two beds')).toBeNull();
  expect(
    cache.getQueriesData({ queryKey: ['branch-inventory-pages', actorId, branchId] }),
  ).toHaveLength(0);
});

test('RENT-003 / ACC-004: actual room-type policy locks inventory paging and close until its own panel closes', async () => {
  jest
    .mocked(listInventoryRoomTypes)
    .mockResolvedValue({ ...typePage(inventory), nextCursor: seatId });
  jest.mocked(readBillingSettings).mockResolvedValue({
    target: { branchId, roomTypeId: typeId },
    canEdit: false,
    localVersion: null,
    effectiveVersion: null,
  });
  const { user } = await show();
  expect(readBillingSettings).not.toHaveBeenCalled();
  await user.press(screen.getByRole('button', { name: 'View billing policy for Two beds' }));
  await screen.findByText(/No rent policy yet/);
  expect(readBillingSettings).toHaveBeenCalledWith(client, { branchId, roomTypeId: typeId });
  expect(screen.getByRole('button', { name: 'Next room type page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Close rooms and beds' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Close billing policy for Two beds' }));
  expect(screen.getByRole('button', { name: 'Next room type page' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Close rooms and beds' })).toBeEnabled();
});

test('ROOM-001/002: even inventory editors cannot create rooms or beds from Operations', async () => {
  setInventory({ ...inventory, permissions: ['inventory_edit', 'pricing_edit'] });
  await show();
  expect(screen.queryByRole('button', { name: 'Create inventory' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create individual room' })).toBeNull();
});
