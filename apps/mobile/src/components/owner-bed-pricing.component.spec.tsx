import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerRoomScreen } from './owner-room-screen';
import type { FloorRooms } from './use-floor-rooms';
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('./owner-bed-grid', () => ({ OwnerBedGrid: () => null }));
jest.mock('./owner-media-gallery', () => ({ OwnerMediaGallery: () => null }));
jest.mock('./owner-room-amenities', () => ({ OwnerRoomAmenities: () => null }));
jest.mock(
  './room-rent-card',
  () => ({
    RoomRentCard: () => {
      const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
      return <Text>Shared room rent</Text>;
    },
  }),
  { virtual: true },
);
it('CHG-056 / ROOM-002: Hostel Setup room details have no shared room-rent editor', async () => {
  const room = { id: 'room', roomTypeId: 'type', label: 'T-101', seats: [] };
  const data = {
    rooms: [room],
    branchId: 'branch',
    command: {},
    inventory: { data: { permissions: [] } },
    buildings: { data: { canEdit: false } },
    floorOf: () => null,
  } as unknown as FloorRooms;
  await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })}>
      <OwnerRoomScreen actorId="actor" brandId="brand" level={{ roomId: 'room' }} data={data} />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('Shared room rent')).toBeNull();
});
