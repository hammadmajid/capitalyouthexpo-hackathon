/// <reference types="jest" />
import { render, screen, fireEvent } from '@testing-library/react-native';
import { OwnerExpandableRoom } from './owner-expandable-room';
import { openRoomsLevel } from './owner-setup-nav';
import type { FloorRooms } from './use-floor-rooms';
jest.mock('./owner-setup-nav', () => ({ openRoomsLevel: jest.fn() }));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
const room = {
  id: 'room-one',
  label: '101',
  seats: [{ id: 'bed-one', archivedAt: null }],
} as FloorRooms['rooms'][number];
it('BRN-001: a room card opens that room on its own screen', async () => {
  await render(
    <OwnerExpandableRoom
      data={
        {
          inventory: { data: { permissions: [] } },
          buildings: { data: { canEdit: false } },
        } as unknown as import('./use-floor-rooms').FloorRooms
      }
      brandId="hostel-one"
      buildingId="building-one"
      floorId="floor-one"
      room={room}
    />,
  );
  expect(screen.getByText('1 bed')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Room 101' }));
  expect(openRoomsLevel).toHaveBeenCalledWith('hostel-one', {
    buildingId: 'building-one',
    floorId: 'floor-one',
    roomId: 'room-one',
  });
});
