import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, duplicateInventoryRoom } from '@hsm/api-client';
import { RoomDuplication } from './room-duplication';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  duplicateInventoryRoom: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002',
  roomId = '10000000-0000-4000-8000-000000000003';
const caches: QueryClient[] = [];
function mount(unavailable = false) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(cache);
  return {
    cache,
    ...render(
      <QueryClientProvider client={cache}>
        <RoomDuplication
          actorId={actorId}
          branchId={branchId}
          rooms={[{ id: roomId, label: '101', archivedAt: null }]}
          unavailable={unavailable}
          blocked={false}
        />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.mocked(duplicateInventoryRoom)
    .mockReset()
    .mockResolvedValue({
      branchId,
      sourceRoomId: roomId,
      roomIds: ['10000000-0000-4000-8000-000000000004'],
    });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function fill() {
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate rooms' }));
  fireEvent.change(screen.getByLabelText('Source room'), { target: { value: roomId } });
  fireEvent.change(screen.getByLabelText('New room numbers'), { target: { value: '201' } });
}
it('PROP-001: submits explicit numbers and refreshes exact actor/branch pages', async () => {
  const { cache } = mount(),
    invalidate = vi.spyOn(cache, 'invalidateQueries');
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create duplicate rooms' }));
  await screen.findByText(/Rooms duplicated/);
  expect(duplicateInventoryRoom).toHaveBeenCalledWith(
    {},
    branchId,
    roomId,
    { roomNumbers: ['201'] },
    expect.any(String),
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['branch-inventory-pages', actorId, branchId],
  });
});
it('PROP-001: unknown outcome locks replacement and retries original command/key', async () => {
  vi.mocked(duplicateInventoryRoom).mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  mount();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create duplicate rooms' }));
  await screen.findByRole('button', { name: 'Retry original duplication' });
  expect(screen.getByLabelText('New room numbers')).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Close duplication' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry original duplication' }));
  await screen.findByText(/Rooms duplicated/);
  expect(vi.mocked(duplicateInventoryRoom).mock.calls[1]).toEqual(
    vi.mocked(duplicateInventoryRoom).mock.calls[0],
  );
});
it('ACC-004: unavailable access and duplicate labels prevent submission', async () => {
  const view = mount(true);
  expect(screen.getByRole('button', { name: 'Duplicate rooms' })).toHaveProperty('disabled', true);
  view.unmount();
  mount();
  fill();
  fireEvent.change(screen.getByLabelText('New room numbers'), { target: { value: '201, 201' } });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create duplicate rooms' })).toHaveProperty(
      'disabled',
      true,
    ),
  );
  expect(duplicateInventoryRoom).not.toHaveBeenCalled();
});
