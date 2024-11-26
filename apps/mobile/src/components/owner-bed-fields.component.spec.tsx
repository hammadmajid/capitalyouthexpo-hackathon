/// <reference types="jest" />
import { render, screen } from '@testing-library/react-native';
import { AddRoomScreen, AddBedScreen } from './owner-add-screens';
import type { FloorRooms } from './use-floor-rooms';
jest.mock('expo-router', () => ({ router: { canGoBack: () => false } }));
jest.mock('./owner-photo-field', () => ({ OwnerPhotoField: () => null }));
it('CHG-057 / ROOM-002: Add Room asks only for its identity/photo, not bed count or admission security', async () => {
  const data = {
    command: { isPending: false, unresolved: false },
    inventory: { data: { roomTypes: [] } },
  } as unknown as FloorRooms;
  await render(<AddRoomScreen actorId="actor" data={data} floorId="floor" />);
  expect(screen.getByLabelText(/Room number/)).toBeTruthy();
  expect(screen.queryByLabelText(/Number of beds/)).toBeNull();
  expect(screen.queryByLabelText(/Security deposit/)).toBeNull();
  expect(screen.queryByLabelText(/Monthly rent for bed/)).toBeNull();
});

it('CHG-058 / BED-001: each bed sets its monthly rent and security deposit together', async () => {
  const data = {
    command: { isPending: false, unresolved: false },
    rooms: [{ id: 'room', label: '206' }],
  } as unknown as FloorRooms;
  await render(<AddBedScreen actorId="actor" data={data} roomId="room" />);
  expect(screen.getByLabelText('Monthly rent (Rs) *')).toBeTruthy();
  expect(screen.getByLabelText('Security deposit (Rs) *')).toBeTruthy();
});
