/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  ApiFailure,
  listPublicInventoryRoomTypes,
  listPublicInventoryRooms,
  listPublicInventoryBeds,
} from '@hsm/api-client';
import { PublicInventoryOptions } from './inventory-options';
import {
  publicQuery,
  publicType,
  publicRoom,
  publicBed,
  setPublicInventory,
} from '../../../test/unit/public-inventory.fixture';
import { dateButton, pickDate } from '../../test-utils/pick-date';
import { pullToRefresh } from '../../test-utils/pull-refresh';
jest.mock('../../lib/runtime', () => ({ client: {}, config: { apiUrl: 'https://example.test' } }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  listPublicInventoryRoomTypes: jest.fn(),
  listPublicInventoryRooms: jest.fn(),
  listPublicInventoryBeds: jest.fn(),
}));
const mockQuote = jest.fn();
jest.mock('./quote', () => ({
  MarketplaceQuote: (props: unknown) => {
    mockQuote(props);
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Quote fixture</Text>;
  },
}));
const branchId = publicType.id,
  nextId = '019a1234-1234-7123-8123-123456789abd';
let cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  setPublicInventory();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => cache.clear());
async function show(actorId?: string) {
  return render(
    <QueryClientProvider client={cache}>
      <PublicInventoryOptions
        key={actorId ?? 'guest'}
        branchId={branchId}
        {...(actorId ? { actorId } : {})}
      />
    </QueryClientProvider>,
  );
}
it('ACC-002 / P2-S1: reads one bounded page per selected parent without a fake physical count', async () => {
  await show();
  await screen.findByText('Two beds');
  await screen.findByRole('button', { name: 'Quote whole room 101' });
  await screen.findByRole('button', { name: 'Quote room 101, bed A' });
  expect(listPublicInventoryRoomTypes).toHaveBeenCalledWith({}, branchId, { limit: 20 });
  expect(listPublicInventoryRooms).toHaveBeenCalledWith({}, branchId, publicType.id, { limit: 20 });
  expect(listPublicInventoryBeds).toHaveBeenCalledWith({}, branchId, publicRoom.id, { limit: 20 });
  expect(listPublicInventoryRoomTypes).toHaveBeenCalledTimes(1);
  expect(listPublicInventoryRooms).toHaveBeenCalledTimes(1);
  expect(listPublicInventoryBeds).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('1 physical rooms')).toBeNull();
});
it('ACC-002: type continuation and first page select only current parents', async () => {
  jest.mocked(listPublicInventoryRoomTypes).mockImplementation(async (_client, scope, page) => ({
    branchId: scope,
    data: [
      {
        ...publicType,
        id: publicQuery(page).cursor ? nextId : publicType.id,
        name: publicQuery(page).cursor ? 'Later type' : 'Two beds',
      },
    ],
    nextCursor: publicQuery(page).cursor ? null : publicType.id,
  }));
  await show();
  await screen.findByRole('button', { name: 'Quote room 101, bed A' });
  await fireEvent.press(screen.getByRole('button', { name: 'Next room types page' }));
  await screen.findByText('Later type');
  await waitFor(() =>
    expect(listPublicInventoryRooms).toHaveBeenLastCalledWith({}, branchId, nextId, { limit: 20 }),
  );
  expect(screen.queryByText('Two beds')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next room types page' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'First room types page' }));
  await screen.findByText('Two beds');
});
it('ACC-002: room continuation clears old choices and returns to first page', async () => {
  jest
    .mocked(listPublicInventoryRooms)
    .mockImplementation(async (_client, scope, parent, page) => ({
      branchId: scope,
      roomTypeId: parent,
      data: [
        {
          ...publicRoom,
          id: publicQuery(page).cursor ? nextId : publicRoom.id,
          label: publicQuery(page).cursor ? '202' : '101',
        },
      ],
      nextCursor: publicQuery(page).cursor ? null : publicRoom.id,
    }));
  await show();
  await screen.findByRole('button', { name: 'Quote room 101, bed A' });
  await fireEvent.press(screen.getByRole('button', { name: 'Next rooms page' }));
  await screen.findByRole('button', { name: 'Quote whole room 202' });
  await waitFor(() =>
    expect(listPublicInventoryBeds).toHaveBeenLastCalledWith({}, branchId, nextId, { limit: 20 }),
  );
  expect(screen.queryByRole('button', { name: 'Quote whole room 101' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'First rooms page' }));
  await screen.findByRole('button', { name: 'Quote whole room 101' });
});
it('ACC-002: later bed quote retains the applied half-open dates and exact target', async () => {
  jest.mocked(listPublicInventoryBeds).mockImplementation(async (_client, scope, parent, page) => ({
    branchId: scope,
    roomId: parent,
    data: [
      {
        ...publicBed,
        id: publicQuery(page).cursor ? nextId : publicBed.id,
        label: publicQuery(page).cursor ? 'Z' : 'A',
        available: publicQuery(page).moveInDate ? true : null,
      },
    ],
    nextCursor: publicQuery(page).cursor ? null : publicBed.id,
  }));
  await show();
  await screen.findByRole('button', { name: 'Quote room 101, bed A' });
  await pickDate('Move in', '2026-11-01');
  await pickDate('Move out', '2026-11-03');
  await fireEvent.press(screen.getByRole('button', { name: 'Apply availability dates' }));
  await waitFor(() =>
    expect(listPublicInventoryBeds).toHaveBeenLastCalledWith({}, branchId, publicRoom.id, {
      limit: 20,
      moveInDate: '2026-11-01',
      moveOutDate: '2026-11-03',
    }),
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Next beds page' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Quote room 101, bed Z' }));
  expect(mockQuote).toHaveBeenLastCalledWith(
    expect.objectContaining({
      target: { kind: 'bed', roomId: publicRoom.id, bedId: nextId },
      initialRange: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    }),
  );
  expect(dateButton('Move in')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Move in: 1 Nov 2026' })).toBeTruthy();
  expect(listPublicInventoryBeds).toHaveBeenLastCalledWith({}, branchId, publicRoom.id, {
    limit: 20,
    cursor: publicBed.id,
    moveInDate: '2026-11-01',
    moveOutDate: '2026-11-03',
  });
});
it('ACC-002: a failed first read is not a successful empty page', async () => {
  jest.mocked(listPublicInventoryRoomTypes).mockRejectedValue(new Error('Offline'));
  await show();
  await screen.findByRole('alert');
  expect(screen.queryByText('No room options are published.')).toBeNull();
  jest
    .mocked(listPublicInventoryRoomTypes)
    .mockResolvedValue({ branchId, data: [], nextCursor: null });
  await pullToRefresh(cache);
  await screen.findByText('No room options are published.');
});
it.each([403, 404, 503])(
  'ACC-002: authoritative %s hides cached options and quote',
  async (status) => {
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'Quote room 101, bed A' }));
    expect(screen.getByText('Quote fixture')).toBeDefined();
    jest.mocked(listPublicInventoryBeds).mockRejectedValue(
      new ApiFailure({
        type: 'https://example.test/problem',
        title: 'Unavailable',
        status,
        code: status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL',
        detail: 'Unavailable',
        traceId: 'fixture',
      }),
    );
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ['public-inventory-pages', branchId] });
    });
    await screen.findByRole('alert');
    expect(screen.queryByText('Two beds')).toBeNull();
    expect(screen.queryByText('Quote fixture')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quote room 101, bed A' })).toBeNull();
  },
);
it('ACC-002: withdrawn whole room cannot resurrect a previous quote', async () => {
  jest.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
    branchId,
    data: [{ ...publicType, inventoryMode: 'whole_room' }],
    nextCursor: null,
  });
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: 'Quote whole room 101' }));
  expect(screen.getByText('Quote fixture')).toBeDefined();
  jest
    .mocked(listPublicInventoryRooms)
    .mockResolvedValue({ branchId, roomTypeId: publicType.id, data: [], nextCursor: null });
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['public-inventory-pages', branchId] });
  });
  await screen.findByText('No rooms on this page.');
  expect(screen.queryByText('Quote fixture')).toBeNull();
  setPublicInventory();
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['public-inventory-pages', branchId] });
  });
  await screen.findByRole('button', { name: 'Quote whole room 101' });
  expect(screen.queryByText('Quote fixture')).toBeNull();
});

it('ACC-002: a late old-branch result cannot replace the current public options', async () => {
  let finish: ((value: Awaited<ReturnType<typeof listPublicInventoryRooms>>) => void) | undefined;
  jest.mocked(listPublicInventoryRooms).mockImplementation((_client, scope, parent) =>
    scope === branchId
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({
          branchId: scope,
          roomTypeId: parent,
          data: [{ ...publicRoom, id: nextId, label: '202' }],
          nextCursor: null,
        }),
  );
  const tree = (scope: string) => (
    <QueryClientProvider client={cache}>
      <PublicInventoryOptions key={scope} branchId={scope} />
    </QueryClientProvider>
  );
  const mounted = await render(tree(branchId));
  await waitFor(() => expect(finish).toBeDefined());
  await mounted.rerender(tree(nextId));
  await screen.findByRole('button', { name: 'Quote whole room 202' });
  await act(async () => {
    finish?.({ branchId, roomTypeId: publicType.id, data: [publicRoom], nextCursor: null });
  });
  expect(screen.queryByRole('button', { name: 'Quote whole room 101' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Quote whole room 202' })).toBeDefined();
});
it('ACC-002: changing actor context unmounts the previous private quote state', async () => {
  const tree = (actorId?: string) => (
    <QueryClientProvider client={cache}>
      <PublicInventoryOptions
        key={actorId ?? 'guest'}
        branchId={branchId}
        {...(actorId ? { actorId } : {})}
      />
    </QueryClientProvider>
  );
  const mounted = await render(tree(branchId));
  await fireEvent.press(await screen.findByRole('button', { name: 'Quote room 101, bed A' }));
  expect(mockQuote).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: branchId }));
  await mounted.rerender(tree(nextId));
  await screen.findByRole('button', { name: 'Quote room 101, bed A' });
  expect(screen.queryByText('Quote fixture')).toBeNull();
  // Cached public options render while the new actor's fresh query is still
  // fetching. The real control refuses input until that revalidation completes.
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Quote room 101, bed A' }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Quote room 101, bed A' }));
  expect(mockQuote).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: nextId }));
});
it('ACC-002: invalid dates make no availability request; unavailable targets cannot be quoted', async () => {
  jest.mocked(listPublicInventoryRooms).mockResolvedValue({
    branchId,
    roomTypeId: publicType.id,
    data: [{ ...publicRoom, wholeRoomAvailable: false }],
    nextCursor: null,
  });
  jest.mocked(listPublicInventoryBeds).mockResolvedValue({
    branchId,
    roomId: publicRoom.id,
    data: [{ ...publicBed, available: false }],
    nextCursor: null,
  });
  await show();
  await screen.findByRole('button', { name: 'Quote room 101, bed A' });
  await pickDate('Move in', '2026-11-03');
  await pickDate('Move out', '2026-11-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Apply availability dates' }));
  expect(screen.getByRole('alert')).toBeDefined();
  expect(listPublicInventoryRoomTypes).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Quote whole room 101' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Quote room 101, bed A' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Quote room 101, bed A' }));
  expect(mockQuote).not.toHaveBeenCalled();
});

it.each(['type', 'room'] as const)(
  'ACC-002: removing a bed target parent (%s) clears its selection permanently',
  async (parent) => {
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'Quote room 101, bed A' }));
    expect(screen.getByText('Quote fixture')).toBeDefined();
    if (parent === 'type')
      jest
        .mocked(listPublicInventoryRoomTypes)
        .mockResolvedValue({ branchId, data: [], nextCursor: null });
    else
      jest
        .mocked(listPublicInventoryRooms)
        .mockResolvedValue({ branchId, roomTypeId: publicType.id, data: [], nextCursor: null });
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ['public-inventory-pages', branchId] });
    });
    await screen.findByText(
      parent === 'type' ? 'No room options are published.' : 'No rooms on this page.',
    );
    expect(screen.queryByText('Quote fixture')).toBeNull();
    setPublicInventory();
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ['public-inventory-pages', branchId] });
    });
    await screen.findByRole('button', { name: 'Quote room 101, bed A' });
    expect(screen.queryByText('Quote fixture')).toBeNull();
  },
);

it.each(['room', 'bed'] as const)(
  'ACC-002: an authoritative inventory-mode change clears the previous %s quote',
  async (kind) => {
    await show();
    const label = kind === 'room' ? 'Quote whole room 101' : 'Quote room 101, bed A';
    await fireEvent.press(await screen.findByRole('button', { name: label }));
    expect(screen.getByText('Quote fixture')).toBeDefined();
    jest.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
      branchId,
      data: [{ ...publicType, inventoryMode: kind === 'room' ? 'per_bed' : 'whole_room' }],
      nextCursor: null,
    });
    await act(async () => {
      await cache.invalidateQueries({
        queryKey: ['public-inventory-pages', branchId, null, null, 'types'],
      });
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: label })).toBeNull());
    expect(screen.queryByText('Quote fixture')).toBeNull();
    setPublicInventory();
    await act(async () => {
      await cache.invalidateQueries({
        queryKey: ['public-inventory-pages', branchId, null, null, 'types'],
      });
    });
    await screen.findByRole('button', { name: label });
    expect(screen.queryByText('Quote fixture')).toBeNull();
  },
);
