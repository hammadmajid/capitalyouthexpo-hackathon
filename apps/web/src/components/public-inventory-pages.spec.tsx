import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  marketplaceDetails,
  listPublicInventoryRoomTypes,
  listPublicInventoryRooms,
  listPublicInventoryBeds,
} from '@hsm/api-client';
import { MarketplaceDetails } from './marketplace-details';
import {
  publicBranchId as branchId,
  publicOverview,
  publicQuery,
  publicType,
  publicRoom,
  publicBed,
  setPublicInventory,
} from '../../test/unit/public-inventory.fixture';
const quote = vi.hoisted(() => vi.fn());
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  marketplaceDetails: vi.fn(),
  listPublicInventoryRoomTypes: vi.fn(),
  listPublicInventoryRooms: vi.fn(),
  listPublicInventoryBeds: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./public-listing-rules', () => ({ PublicListingRules: () => null }));
vi.mock('./public-gallery', () => ({ PublicGallery: () => null }));
vi.mock('./save-hostel-action', () => ({ SaveHostelAction: () => null }));
vi.mock('./marketplace-quote', () => ({
  MarketplaceQuote: (props: unknown) => {
    quote(props);
    return <p>Quote fixture</p>;
  },
}));
const nextId = '019a1234-1234-7123-8123-123456789abd';
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(marketplaceDetails).mockResolvedValue(publicOverview);
  setPublicInventory();
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
function show() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const tree = (scope: string) => (
    <QueryClientProvider client={cache}>
      <MarketplaceDetails branchId={scope} />
    </QueryClientProvider>
  );
  return { ...render(tree(branchId)), cache, tree };
}
// Wait for inexpensive exact text before checking the original accessible role/name.
// Repeated whole-page accessibility scans can delay the dependent query notifications.
async function loadedButton(name: string) {
  const element = await screen.findByText(name, { selector: 'button' });
  const parent = element.parentElement;
  if (!parent) throw Error('Rendered inventory control is missing its parent');
  expect(screen.getAllByText(name, { selector: 'button' })).toEqual([element]);
  expect(within(parent).getByRole('button', { name })).toBe(element);
  await waitFor(() => {
    expect(element.isConnected).toBe(true);
    expect(element.matches(':disabled')).toBe(false);
  });
  return element;
}
async function loadedHeading(name: string) {
  const element = await screen.findByText(name, { selector: 'h1,h2,h3,h4,h5,h6' });
  const parent = element.parentElement;
  if (!parent) throw Error('Rendered inventory heading is missing its parent');
  expect(screen.getAllByText(name, { selector: 'h1,h2,h3,h4,h5,h6' })).toEqual([element]);
  expect(within(parent).getByRole('heading', { name })).toBe(element);
  return element;
}
it('ACC-002 / P2-S1: initial options request only one bounded page for each selected parent', async () => {
  show();
  await loadedHeading('Actual branch');
  await loadedHeading('Two beds');
  await loadedButton('Quote whole room 101');
  await loadedButton('Quote room 101, bed A');
  expect(listPublicInventoryRoomTypes).toHaveBeenCalledWith({}, branchId, { limit: 20 });
  expect(listPublicInventoryRooms).toHaveBeenCalledWith({}, branchId, publicType.id, { limit: 20 });
  expect(listPublicInventoryBeds).toHaveBeenCalledWith({}, branchId, publicRoom.id, { limit: 20 });
  expect(listPublicInventoryRoomTypes).toHaveBeenCalledTimes(1);
  expect(listPublicInventoryRooms).toHaveBeenCalledTimes(1);
  expect(listPublicInventoryBeds).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('1 physical rooms')).toBeNull();
});
it('ACC-002: type next/final/first pages load only the current physical parent', async () => {
  vi.mocked(listPublicInventoryRoomTypes).mockImplementation(async (_client, scope, page) => ({
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
  show();
  await loadedButton('Quote room 101, bed A');
  fireEvent.click(screen.getByRole('button', { name: 'Next room types page' }));
  await loadedHeading('Later type');
  await waitFor(() =>
    expect(listPublicInventoryRooms).toHaveBeenLastCalledWith({}, branchId, nextId, { limit: 20 }),
  );
  expect(screen.queryByRole('heading', { name: 'Two beds' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next room types page' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'First room types page' }));
  await loadedHeading('Two beds');
});
it('ACC-002: room next/first pages retain the real type and clear stale room choices', async () => {
  vi.mocked(listPublicInventoryRooms).mockImplementation(async (_client, scope, parent, page) => ({
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
  show();
  await loadedButton('Quote room 101, bed A');
  fireEvent.click(screen.getByRole('button', { name: 'Next rooms page' }));
  await loadedButton('Quote whole room 202');
  expect(screen.queryByRole('button', { name: 'Quote whole room 101' })).toBeNull();
  await waitFor(() =>
    expect(listPublicInventoryBeds).toHaveBeenLastCalledWith({}, branchId, nextId, { limit: 20 }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'First rooms page' }));
  await loadedButton('Quote whole room 101');
});
it('ACC-002: bed paging preserves applied dates and uses the exact later target in a fresh quote', async () => {
  vi.mocked(listPublicInventoryBeds).mockImplementation(async (_client, scope, parent, page) => ({
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
  vi.mocked(listPublicInventoryRooms).mockImplementation(async (_client, scope, parent, page) => ({
    branchId: scope,
    roomTypeId: parent,
    data: [{ ...publicRoom, wholeRoomAvailable: publicQuery(page).moveInDate ? true : null }],
    nextCursor: null,
  }));
  show();
  await loadedButton('Quote room 101, bed A');
  fireEvent.change(screen.getByLabelText('Availability move-in'), {
    target: { value: '2026-11-01' },
  });
  fireEvent.change(screen.getByLabelText('Availability move-out'), {
    target: { value: '2026-11-03' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply availability dates' }));
  await waitFor(() =>
    expect(listPublicInventoryBeds).toHaveBeenLastCalledWith({}, branchId, publicRoom.id, {
      limit: 20,
      moveInDate: '2026-11-01',
      moveOutDate: '2026-11-03',
    }),
  );
  fireEvent.click(await loadedButton('Next beds page'));
  fireEvent.click(await loadedButton('Quote room 101, bed Z'));
  expect(quote).toHaveBeenLastCalledWith(
    expect.objectContaining({
      target: { kind: 'bed', roomId: publicRoom.id, bedId: nextId },
      initialRange: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    }),
  );
  expect(screen.getByLabelText('Availability move-in')).toHaveProperty('value', '2026-11-01');
  expect(listPublicInventoryBeds).toHaveBeenLastCalledWith({}, branchId, publicRoom.id, {
    limit: 20,
    cursor: publicBed.id,
    moveInDate: '2026-11-01',
    moveOutDate: '2026-11-03',
  });
});
it('ACC-002: failed first read stays distinct from a real empty option page', async () => {
  vi.mocked(listPublicInventoryRoomTypes).mockRejectedValue(new Error('Offline'));
  show();
  await screen.findByRole('alert');
  expect(screen.queryByText('No room options are published.')).toBeNull();
  vi.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
    branchId,
    data: [],
    nextCursor: null,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry room options' }));
  await screen.findByText('No room options are published.');
  expect(screen.queryByRole('button', { name: 'Quote whole room 101' })).toBeNull();
});
it.each([403, 404, 503])(
  'ACC-002: authoritative refresh error %s hides cached physical options and quotes',
  async (status) => {
    const { cache } = show();
    await loadedHeading('Actual branch');
    await loadedHeading('Two beds');
    await loadedButton('Quote whole room 101');
    fireEvent.click(await loadedButton('Quote room 101, bed A'));
    expect(screen.getByText('Quote fixture')).toBeDefined();
    vi.mocked(listPublicInventoryBeds).mockRejectedValue(
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
    expect(screen.queryByRole('button', { name: 'Quote room 101, bed A' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Two beds' })).toBeNull();
    expect(screen.queryByText('Quote fixture')).toBeNull();
  },
);
it('ACC-002: a late old-branch room result cannot replace the current branch options', async () => {
  let finish: ((value: Awaited<ReturnType<typeof listPublicInventoryRooms>>) => void) | undefined;
  vi.mocked(marketplaceDetails).mockImplementation(async (_client, scope) => ({
    ...publicOverview,
    branchId: scope,
    name: scope === branchId ? 'Actual branch' : 'Current branch',
  }));
  vi.mocked(listPublicInventoryRoomTypes).mockImplementation(async (_client, scope) => ({
    branchId: scope,
    data: [{ ...publicType, id: scope }],
    nextCursor: null,
  }));
  vi.mocked(listPublicInventoryRooms).mockImplementation((_client, scope, parent) =>
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
  const mounted = show();
  await waitFor(() => expect(finish).toBeDefined());
  mounted.rerender(mounted.tree(nextId));
  await loadedButton('Quote whole room 202');
  await act(async () => {
    finish?.({ branchId, roomTypeId: publicType.id, data: [publicRoom], nextCursor: null });
  });
  expect(screen.queryByRole('button', { name: 'Quote whole room 101' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Current branch' })).toBeDefined();
});

it('ACC-002: a withdrawn whole-room selection cannot return as an unsolicited quote', async () => {
  vi.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
    branchId,
    data: [{ ...publicType, inventoryMode: 'whole_room' }],
    nextCursor: null,
  });
  const { cache } = show();
  fireEvent.click(await loadedButton('Quote whole room 101'));
  expect(screen.getByText('Quote fixture')).toBeDefined();
  vi.mocked(listPublicInventoryRooms).mockResolvedValue({
    branchId,
    roomTypeId: publicType.id,
    data: [],
    nextCursor: null,
  });
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['public-inventory-pages', branchId] });
  });
  await screen.findByText('No rooms on this page.');
  expect(screen.queryByText('Quote fixture')).toBeNull();
  setPublicInventory();
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['public-inventory-pages', branchId] });
  });
  await loadedButton('Quote whole room 101');
  expect(screen.queryByText('Quote fixture')).toBeNull();
});

it.each(['type', 'room'] as const)(
  'ACC-002: removing a bed target parent (%s) clears its selection permanently',
  async (parent) => {
    const { cache } = show();
    fireEvent.click(await loadedButton('Quote room 101, bed A'));
    expect(screen.getByText('Quote fixture')).toBeDefined();
    if (parent === 'type')
      vi.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
        branchId,
        data: [],
        nextCursor: null,
      });
    else
      vi.mocked(listPublicInventoryRooms).mockResolvedValue({
        branchId,
        roomTypeId: publicType.id,
        data: [],
        nextCursor: null,
      });
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
    await loadedButton('Quote room 101, bed A');
    expect(screen.queryByText('Quote fixture')).toBeNull();
  },
);

it.each(['room', 'bed'] as const)(
  'ACC-002: an authoritative inventory-mode change clears the previous %s quote',
  async (kind) => {
    const { cache } = show();
    const label = kind === 'room' ? 'Quote whole room 101' : 'Quote room 101, bed A';
    fireEvent.click(await loadedButton(label));
    expect(screen.getByText('Quote fixture')).toBeDefined();
    vi.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
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
    await loadedButton(label);
    expect(screen.queryByText('Quote fixture')).toBeNull();
  },
);
