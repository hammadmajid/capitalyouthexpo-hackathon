/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  listApprovedAmenities,
  readRoomLevelAmenities,
  saveRoomLevelAmenities,
} from '@hsm/api-client';
import { OwnerRoomAmenities } from './owner-room-amenities';
import { actorClient } from '../lib/runtime';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(), sessions: { restore: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '019a1234-1234-7123-8123-000000000099' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  listApprovedAmenities: jest.fn(),
  readRoomLevelAmenities: jest.fn(),
  saveRoomLevelAmenities: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
jest.mock('./owner-custom-amenities', () => ({ OwnerCustomAmenities: () => null }));
const ids = {
  actor: '019a1234-1234-7123-8123-000000000001',
  branch: '019a1234-1234-7123-8123-000000000002',
  room: '019a1234-1234-7123-8123-000000000003',
  type: '019a1234-1234-7123-8123-000000000004',
};
const version = 'a'.repeat(64);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(actorClient).mockResolvedValue({} as Awaited<ReturnType<typeof actorClient>>);
  jest.mocked(listApprovedAmenities).mockResolvedValue({
    data: [
      { code: 'attached_bath', name: 'Attached bathroom' },
      { code: 'wifi', name: 'Wi-Fi' },
    ],
    nextCursor: null,
  });
  jest.mocked(readRoomLevelAmenities).mockResolvedValue({
    branchId: ids.branch,
    roomId: ids.room,
    roomTypeId: ids.type,
    customized: false,
    version,
    canEdit: true,
    amenities: [],
    typeAmenities: [],
  });
  jest.mocked(saveRoomLevelAmenities).mockResolvedValue({
    branchId: ids.branch,
    roomId: ids.room,
    roomTypeId: ids.type,
    customized: true,
    version: 'b'.repeat(64),
    canEdit: true,
    amenities: [{ code: 'attached_bath', name: 'Attached bathroom', isActive: true }],
    typeAmenities: [],
  });
});
it('ROOM-AMN v2.15: a room saves its own amenities with the current version', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  const view = await render(
    <QueryClientProvider client={cache}>
      <OwnerRoomAmenities actorId={ids.actor} branchId={ids.branch} roomId={ids.room} />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('radio', { name: 'Attached bathroom' }));
  // Hostel-wide amenities are not offered per room.
  expect(screen.queryByRole('radio', { name: 'Wi-Fi' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save room amenities' }));
  await waitFor(() =>
    expect(saveRoomLevelAmenities).toHaveBeenCalledWith(
      expect.anything(),
      ids.branch,
      ids.room,
      version,
      { mode: 'custom', amenityCodes: ['attached_bath'] },
      expect.any(String),
    ),
  );
  view.unmount();
  cache.clear();
});
