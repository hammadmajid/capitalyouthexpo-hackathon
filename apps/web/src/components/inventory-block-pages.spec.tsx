import { inventoryPageQuerySchema } from '@hsm/contracts';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
  readBranchInventory,
} from '@hsm/api-client';
import { InventoryBlockPagedForm } from './inventory-block-paged-form';
import { browserClient } from '../lib/client';
import {
  actorId,
  branchId,
  roomId,
  seatId,
  typeId,
  inventory,
  setInventory,
  typePage,
  type as roomType,
} from '../../test/unit/inventory-pages.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listInventoryRoomTypes: vi.fn(),
  listInventoryRooms: vi.fn(),
  listInventoryBeds: vi.fn(),
  readBranchInventory: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
function pageCursor(input: unknown) {
  return inventoryPageQuerySchema.parse(input ?? {}).cursor;
}
const value = { ...inventory, permissions: ['block_manage' as const] };
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  setInventory(value);
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
});
async function show(prime = true) {
  const save = vi.fn(),
    cancel = vi.fn(),
    cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  if (prime) {
    // Begin page interaction cases from confirmed initial metadata; later pages still load through the component.
    const prefix = ['branch-inventory-pages', actorId, branchId];
    await cache.fetchQuery({
      queryKey: [...prefix, 'types', undefined],
      queryFn: () => listInventoryRoomTypes(browserClient(), branchId, { limit: 20 }),
    });
    await cache.fetchQuery({
      queryKey: [...prefix, 'rooms', typeId, undefined],
      queryFn: () => listInventoryRooms(browserClient(), branchId, typeId, { limit: 20 }),
    });
    await cache.fetchQuery({
      queryKey: [...prefix, 'beds', roomId, undefined],
      queryFn: () => listInventoryBeds(browserClient(), branchId, roomId, { limit: 20 }),
    });
  }
  await act(async () => {
    render(
      <QueryClientProvider client={cache}>
        <InventoryBlockPagedForm
          actorId={actorId}
          branchId={branchId}
          pending={false}
          disabled={false}
          onSave={save}
          onCancel={cancel}
        />
      </QueryClientProvider>,
    );
  });
  return { save, cancel, cache };
}
async function fill(kind: 'room' | 'bed' = 'bed') {
  await screen.findByRole('option', { name: '101' });
  fireEvent.change(screen.getByLabelText('Room to block'), { target: { value: roomId } });
  fireEvent.change(screen.getByLabelText('Block target'), { target: { value: kind } });
  if (kind === 'bed')
    fireEvent.change(screen.getByLabelText('Bed to block'), { target: { value: seatId } });
  fireEvent.change(screen.getByLabelText('Blocked from'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Available again on'), {
    target: { value: '2026-11-04' },
  });
  fireEvent.change(screen.getByLabelText('Block category'), { target: { value: 'maintenance' } });
  fireEvent.change(screen.getByLabelText('Private block reason'), {
    target: { value: 'Retained repair reason' },
  });
}
it('ACC-004: target reads are bounded to the selected parents without legacy inventory hydration', async () => {
  await show(true);
  await fill();
  expect(readBranchInventory).not.toHaveBeenCalled();
  expect(listInventoryRoomTypes).toHaveBeenCalledWith({}, branchId, { limit: 20 });
  expect(listInventoryRooms).toHaveBeenCalledWith({}, branchId, typeId, { limit: 20 });
  expect(listInventoryBeds).toHaveBeenCalledWith({}, branchId, roomId, { limit: 20 });
});
it('ACC-001: a later bed page preserves room, dates and reason but requires a new actual bed choice', async () => {
  const later = randomUUID();
  vi.mocked(listInventoryBeds).mockImplementation(async (_client, branch, room, query) => ({
    branchId: branch,
    roomId: room,
    permissions: value.permissions,
    canConfigureManagers: false,
    data: pageCursor(query)
      ? [
          {
            id: later,
            roomId,
            ordinal: 21,
            label: 'Later bed',
            status: 'maintenance',
            archivedAt: null,
          },
        ]
      : (value.rooms[0]?.seats ?? []),
    nextCursor: pageCursor(query) ? null : seatId,
  }));
  const { save } = await show();
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Next block beds page' }));
  await screen.findByRole('option', { name: 'Later bed (number 21)' });
  expect(screen.getByLabelText('Room to block')).toHaveProperty('value', roomId);
  expect(screen.getByLabelText('Bed to block')).toHaveProperty('value', '');
  expect(screen.getByLabelText('Private block reason')).toHaveProperty(
    'value',
    'Retained repair reason',
  );
  expect(screen.getByLabelText('Blocked from')).toHaveProperty('value', '2026-11-01');
  fireEvent.change(screen.getByLabelText('Bed to block'), { target: { value: later } });
  fireEvent.click(screen.getByRole('button', { name: 'Create block' }));
  expect(save).toHaveBeenCalledWith({
    target: { kind: 'bed', roomId, bedId: later },
    range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-04' },
    kind: 'maintenance',
    reason: 'Retained repair reason',
  });
  expect(listInventoryBeds).toHaveBeenLastCalledWith({}, branchId, roomId, {
    limit: 20,
    cursor: seatId,
  });
  fireEvent.click(screen.getByRole('button', { name: 'First block beds page' }));
  await screen.findByRole('option', { name: 'A (number 1)' });
  expect(screen.getByLabelText('Bed to block')).toHaveProperty('value', '');
});
it('ACC-001: room paging clears the target without discarding the independent date/reason draft', async () => {
  const later = randomUUID();
  vi.mocked(listInventoryRooms).mockImplementation(async (_client, branch, parent, query) => ({
    branchId: branch,
    roomTypeId: parent,
    permissions: value.permissions,
    canConfigureManagers: false,
    data: [
      {
        id: pageCursor(query) ? later : roomId,
        branchId,
        roomTypeId: typeId,
        label: pageCursor(query) ? 'Later room' : '101',
        status: 'inactive',
        archivedAt: null,
      },
    ],
    nextCursor: pageCursor(query) ? null : roomId,
  }));
  const { save } = await show();
  await fill('room');
  fireEvent.click(screen.getByRole('button', { name: 'Next block rooms page' }));
  await screen.findByRole('option', { name: 'Later room' });
  expect(screen.getByLabelText('Room to block')).toHaveProperty('value', '');
  expect(screen.getByLabelText('Private block reason')).toHaveProperty(
    'value',
    'Retained repair reason',
  );
  fireEvent.change(screen.getByLabelText('Room to block'), { target: { value: later } });
  fireEvent.click(screen.getByRole('button', { name: 'Create block' }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ target: { kind: 'room', roomId: later } }),
  );
  expect(listInventoryRooms).toHaveBeenLastCalledWith({}, branchId, typeId, {
    limit: 20,
    cursor: roomId,
  });
});
it('ACC-004: type paging requests only the new parent and resets physical selections', async () => {
  const later = randomUUID();
  vi.mocked(listInventoryRoomTypes).mockImplementation(async (_client, _branch, query) => ({
    ...typePage(value),
    data: [
      {
        ...roomType,
        id: pageCursor(query) ? later : typeId,
        name: pageCursor(query) ? 'Later type' : 'Two beds',
      },
    ],
    nextCursor: pageCursor(query) ? null : typeId,
  }));
  await show();
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Next block room types page' }));
  // ACC-004: let the dependent page queries settle before the expensive role lookup.
  await waitFor(() => expect(screen.queryByText('Loading block target inventory…')).toBeNull());
  expect(screen.getByRole('option', { name: 'Later type' })).toHaveProperty('value', later);
  await waitFor(() =>
    expect(listInventoryRooms).toHaveBeenLastCalledWith({}, branchId, later, { limit: 20 }),
  );
  expect(screen.getByLabelText('Room to block')).toHaveProperty('value', '');
  expect(screen.getByLabelText('Private block reason')).toHaveProperty(
    'value',
    'Retained repair reason',
  );
});
it('ACC-004: a child permission refresh blocks saving even with a retained target', async () => {
  const { cache, save } = await show();
  await fill();
  vi.mocked(listInventoryBeds).mockResolvedValue({
    branchId,
    roomId,
    permissions: [],
    canConfigureManagers: false,
    data: value.rooms[0]?.seats ?? [],
    nextCursor: null,
  });
  await cache.invalidateQueries({
    queryKey: ['branch-inventory-pages', actorId, branchId, 'beds'],
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create block' }).matches(':disabled')).toBe(true),
  );
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Private block reason')).toHaveProperty(
    'value',
    'Retained repair reason',
  );
});
it.each(['FORBIDDEN', 'NOT_FOUND'] as const)(
  'SEC-003: %s hides cached target choices and private draft',
  async (code) => {
    const { cache, save } = await show();
    await fill();
    vi.mocked(listInventoryBeds).mockRejectedValue(
      new ApiFailure({
        type: 'https://example.test/problem',
        title: 'Denied',
        status: code === 'FORBIDDEN' ? 403 : 404,
        code,
        detail: 'Unavailable',
        traceId: 'fixture',
      }),
    );
    await cache.invalidateQueries({
      queryKey: ['branch-inventory-pages', actorId, branchId, 'beds'],
    });
    await screen.findByRole('alert');
    expect(screen.queryByRole('option', { name: '101' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'A (number 1)' })).toBeNull();
    expect(screen.queryByDisplayValue('Retained repair reason')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  },
);

it('ACC-004: a failed later bed page retains independent draft fields and supports explicit recovery', async () => {
  const first = {
    branchId,
    roomId,
    permissions: value.permissions,
    canConfigureManagers: false,
    data: value.rooms[0]?.seats ?? [],
    nextCursor: seatId,
  };
  vi.mocked(listInventoryBeds).mockImplementation(async (_client, _branch, _room, query) => {
    if (pageCursor(query)) throw new Error('Offline');
    return first;
  });
  const { save } = await show();
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Next block beds page' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Private block reason')).toHaveProperty(
    'value',
    'Retained repair reason',
  );
  expect(screen.getByLabelText('Available again on')).toHaveProperty('value', '2026-11-04');
  expect(screen.getByRole('button', { name: 'Create block' }).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Restore block target first pages' }));
  await screen.findByRole('option', { name: '101' });
  expect(screen.getByLabelText('Room to block')).toHaveProperty('value', '');
  expect(screen.getByLabelText('Private block reason')).toHaveProperty(
    'value',
    'Retained repair reason',
  );
  expect(save).not.toHaveBeenCalled();
});

it('ACC-004: initial pending inventory exposes no fabricated empty page and permits safe cancellation', async () => {
  let complete: ((value: ReturnType<typeof typePage>) => void) | undefined;
  vi.mocked(listInventoryRoomTypes).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const { cancel, save } = await show(false);
  expect(screen.getByRole('status').textContent).toContain('Loading block target inventory');
  expect(screen.queryByText('No rooms on this page. Choose another room type or page.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Create block' }).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel block edit' }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    complete?.(typePage(value));
  });
});
