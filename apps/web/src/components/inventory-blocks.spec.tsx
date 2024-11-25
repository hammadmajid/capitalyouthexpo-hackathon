import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  listInventoryBlocks,
  createInventoryBlock,
  releaseInventoryBlock,
  readInventoryAccess,
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
} from '@hsm/api-client';
import { InventoryBlocks } from './inventory-blocks';
import { setInventory, type as roomType } from '../../test/unit/inventory-pages.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listInventoryBlocks: vi.fn(),
  createInventoryBlock: vi.fn(),
  releaseInventoryBlock: vi.fn(),
  readInventoryAccess: vi.fn(),
  listInventoryRoomTypes: vi.fn(),
  listInventoryRooms: vi.fn(),
  listInventoryBeds: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = randomUUID(),
  branchId = randomUUID(),
  roomId = randomUUID(),
  typeId = randomUUID(),
  id = randomUUID();
const range = { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' };
const state = {
  id,
  branchId,
  target: { kind: 'room' as const, roomId },
  range,
  kind: 'manual' as const,
  releasedAt: null,
};
const row = { ...state, roomLabel: '101', bedLabel: null, createdAt: '2026-10-15T10:00:00Z' };
const inventory = {
  roomTypes: [{ ...roomType, id: typeId, branchId }],
  rooms: [
    {
      id: roomId,
      branchId,
      roomTypeId: typeId,
      label: '101',
      status: 'active' as const,
      archivedAt: null,
      seats: [],
    },
  ],
  permissions: ['block_manage' as const],
  canConfigureManagers: false,
};
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readInventoryAccess).mockResolvedValue({ ...inventory, branchId });
  setInventory(inventory, branchId);
  vi.mocked(listInventoryBlocks).mockResolvedValue({ data: [row], nextCursor: null });
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
        <InventoryBlocks actorId={actorId} branchId={branchId} />
      </QueryClientProvider>,
    ),
    cache,
  };
}
it('ACC-004: actual private block history is scoped and does not expose record or actor IDs', async () => {
  show();
  await screen.findByRole('heading', { name: 'Room 101 · All beds' });
  expect(listInventoryBlocks).toHaveBeenCalledWith({}, branchId, {
    state: 'unreleased',
    limit: 20,
  });
  expect(document.body.textContent).not.toContain(id);
  expect(document.body.textContent).not.toContain(actorId);
  expect(screen.queryByRole('link')).toBeNull();
});
it('ACC-004: a Manager without block_manage can read history but cannot create or release', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({ ...inventory, branchId, permissions: [] });
  show();
  await screen.findByRole('heading', { name: 'Room 101 · All beds' });
  expect(screen.queryByRole('button', { name: 'New inventory block' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Release block for/ })).toBeNull();
});
it('ACC-001: release waits for persisted state and then refreshes actual history', async () => {
  let resolve:
    ((value: { releasedAt: string } & Omit<typeof state, 'releasedAt'>) => void) | undefined;
  vi.mocked(releaseInventoryBlock).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Release block for/ }));
  fireEvent.change(screen.getByLabelText('Release reason'), {
    target: { value: 'Work completed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
  await waitFor(() => expect(releaseInventoryBlock).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Manual reservation · Unreleased')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Releasing block…' }).matches(':disabled')).toBe(true);
  vi.mocked(listInventoryBlocks).mockResolvedValue({ data: [], nextCursor: null });
  resolve?.({ ...state, releasedAt: '2026-10-15T11:00:00Z' });
  await screen.findByText('Block released.');
  await screen.findByText('No blocks match this filter.');
});
it('ACC-004: failed release retries retain its reason and command key', async () => {
  vi.mocked(releaseInventoryBlock).mockRejectedValue(new Error('Interrupted'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Release block for/ }));
  fireEvent.change(screen.getByLabelText('Release reason'), {
    target: { value: 'Work completed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
  await waitFor(() => expect(releaseInventoryBlock).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(releaseInventoryBlock).mock.calls;
  expect(calls[0]?.[4]).toBe(calls[1]?.[4]);
  expect(calls[0]?.slice(0, 4)).toEqual([{}, branchId, id, 'Work completed']);
});
it('ACC-004: cursor pagination retains previous block rows', async () => {
  vi.mocked(listInventoryBlocks)
    .mockResolvedValueOnce({ data: [row], nextCursor: id })
    .mockResolvedValueOnce({
      data: [{ ...row, id: randomUUID(), roomLabel: '202' }],
      nextCursor: null,
    });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Load more blocks' }));
  await screen.findByRole('heading', { name: 'Room 202 · All beds' });
  expect(screen.getByRole('heading', { name: 'Room 101 · All beds' })).toBeDefined();
  expect(listInventoryBlocks).toHaveBeenNthCalledWith(2, {}, branchId, {
    state: 'unreleased',
    limit: 20,
    cursor: id,
  });
});
it('SEC-003: changing branch clears the private release reason', async () => {
  const mounted = show(),
    next = randomUUID();
  fireEvent.click(await screen.findByRole('button', { name: /Release block for/ }));
  fireEvent.change(screen.getByLabelText('Release reason'), {
    target: { value: 'Previous branch private reason' },
  });
  vi.mocked(listInventoryBlocks).mockResolvedValue({ data: [], nextCursor: null });
  mounted.rerender(
    <QueryClientProvider client={mounted.cache}>
      <InventoryBlocks actorId={actorId} branchId={next} />
    </QueryClientProvider>,
  );
  await screen.findByText('No blocks match this filter.');
  expect(screen.queryByDisplayValue('Previous branch private reason')).toBeNull();
  expect(listInventoryBlocks).toHaveBeenLastCalledWith({}, next, {
    state: 'unreleased',
    limit: 20,
  });
});
it('SEC-003: revoked access hides stale history and privileged forms', async () => {
  vi.mocked(releaseInventoryBlock).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.test/problem',
      title: 'Denied',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Unavailable',
      traceId: 'fixture',
    }),
  );
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Release block for/ }));
  fireEvent.change(screen.getByLabelText('Release reason'), {
    target: { value: 'Work completed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
  await screen.findByRole('button', { name: 'Retry block access' });
  expect(screen.queryByLabelText('Release reason')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Room 101 · All beds' })).toBeNull();
});
it('ACC-004: a failed history request remains distinct from an empty successful list', async () => {
  vi.mocked(listInventoryBlocks)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ data: [], nextCursor: null });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry blocks' }));
  await screen.findByText('No blocks match this filter.');
});

it('ACC-001: creating a non-overlapping block sends current inventory and refreshes persisted history', async () => {
  const nextId = randomUUID(),
    nextRange = { moveInDate: '2026-11-04', moveOutDate: '2026-11-06' };
  vi.mocked(createInventoryBlock).mockResolvedValue({
    ...state,
    id: nextId,
    kind: 'maintenance',
    range: nextRange,
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'New inventory block' }));
  // Observe each bounded parent stage before asserting the final room option.
  await waitFor(() =>
    expect(listInventoryRoomTypes).toHaveBeenCalledWith({}, branchId, { limit: 20 }),
  );
  await waitFor(() =>
    expect(listInventoryRooms).toHaveBeenCalledWith({}, branchId, typeId, { limit: 20 }),
  );
  await waitFor(() =>
    expect(listInventoryBeds).toHaveBeenCalledWith({}, branchId, roomId, { limit: 20 }),
  );
  await screen.findByRole('option', { name: '101' });
  fireEvent.change(screen.getByLabelText('Room to block'), { target: { value: roomId } });
  fireEvent.change(screen.getByLabelText('Block target'), { target: { value: 'room' } });
  fireEvent.change(screen.getByLabelText('Blocked from'), {
    target: { value: nextRange.moveInDate },
  });
  fireEvent.change(screen.getByLabelText('Available again on'), {
    target: { value: nextRange.moveOutDate },
  });
  fireEvent.change(screen.getByLabelText('Block category'), { target: { value: 'maintenance' } });
  fireEvent.change(screen.getByLabelText('Private block reason'), {
    target: { value: 'Repair frame' },
  });
  vi.mocked(listInventoryBlocks).mockResolvedValue({
    data: [row, { ...row, id: nextId, kind: 'maintenance', range: nextRange }],
    nextCursor: null,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create block' }));
  await waitFor(() =>
    expect(createInventoryBlock).toHaveBeenCalledWith(
      {},
      branchId,
      {
        target: { kind: 'room', roomId },
        range: nextRange,
        kind: 'maintenance',
        reason: 'Repair frame',
      },
      expect.any(String),
    ),
  );
  await screen.findByText('Block created.');
  await screen.findByText('2026-11-04 until 2026-11-06 (end excluded)');
  expect(screen.queryByLabelText('Private block reason')).toBeNull();
});

it('ACC-004: a permission refresh outage retains the private release reason while disabling submission', async () => {
  vi.mocked(releaseInventoryBlock).mockRejectedValue(new Error('Offline'));
  vi.mocked(readInventoryAccess)
    .mockResolvedValueOnce({ ...inventory, branchId })
    .mockRejectedValue(new Error('Offline'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Release block for/ }));
  fireEvent.change(screen.getByLabelText('Release reason'), {
    target: { value: 'Retained private reason' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
  await screen.findByRole('button', { name: 'Refresh blocks' });
  expect(screen.getByLabelText('Release reason')).toHaveProperty(
    'value',
    'Retained private reason',
  );
  expect(screen.getByRole('button', { name: 'Confirm release' }).matches(':disabled')).toBe(true);
});
