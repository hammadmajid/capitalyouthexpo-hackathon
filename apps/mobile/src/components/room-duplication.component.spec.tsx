jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, duplicateInventoryRoom } from '@hsm/api-client';
import { NativeRoomDuplication } from './room-duplication';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  duplicateInventoryRoom: jest.fn(),
}));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000004' }));
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002',
  roomId = '10000000-0000-4000-8000-000000000003';
const caches: QueryClient[] = [];
async function mount(unavailable = false) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(cache);
  return {
    cache,
    ...(await render(
      <QueryClientProvider client={cache}>
        <NativeRoomDuplication
          actorId={actorId}
          branchId={branchId}
          rooms={[{ id: roomId, label: '101', archivedAt: null }]}
          unavailable={unavailable}
          blocked={false}
        />
      </QueryClientProvider>,
    )),
  };
}
beforeEach(() => {
  jest
    .mocked(duplicateInventoryRoom)
    .mockReset()
    .mockResolvedValue({
      branchId,
      sourceRoomId: roomId,
      roomIds: ['10000000-0000-4000-8000-000000000005'],
    });
});
afterEach(async () => {
  await cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
async function fill() {
  await fireEvent.press(screen.getByText('Duplicate rooms'));
  await fireEvent.press(screen.getByText('Use room 101'));
  await fireEvent.changeText(screen.getByLabelText('New room numbers'), '201');
}
it('PROP-001: native submits and refreshes exact actor/branch pages', async () => {
  const { cache } = await mount(),
    invalidate = jest.spyOn(cache, 'invalidateQueries');
  await fill();
  await fireEvent.press(screen.getByText('Create duplicate rooms'));
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
it('PROP-001: native locks unknown outcome and retries original key/body', async () => {
  jest
    .mocked(duplicateInventoryRoom)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  await mount();
  await fill();
  await fireEvent.press(screen.getByText('Create duplicate rooms'));
  await screen.findByText('Retry original duplication');
  expect(screen.getByLabelText('New room numbers').props.editable).toBe(false);
  expect(
    screen.getByRole('button', { name: 'Close duplication' }).props.accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(screen.getByText('Retry original duplication'));
  await screen.findByText(/Rooms duplicated/);
  expect(jest.mocked(duplicateInventoryRoom).mock.calls[1]).toEqual(
    jest.mocked(duplicateInventoryRoom).mock.calls[0],
  );
});
it('ACC-004: unavailable source and duplicate labels cannot submit', async () => {
  const view = await mount(true);
  expect(
    screen.getByRole('button', { name: 'Duplicate rooms' }).props.accessibilityState.disabled,
  ).toBe(true);
  await view.unmount();
  await mount();
  await fill();
  await fireEvent.changeText(screen.getByLabelText('New room numbers'), '201,201');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create duplicate rooms' }).props.accessibilityState
        .disabled,
    ).toBe(true),
  );
  expect(duplicateInventoryRoom).not.toHaveBeenCalled();
});
