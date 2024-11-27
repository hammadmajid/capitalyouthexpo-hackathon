import { render, screen } from '@testing-library/react-native';
import { PublicInventoryRoomOptions } from './inventory-room-options';
jest.mock('../../lib/runtime', () => ({ client: {}, config: { apiUrl: 'https://example.test' } }));
const roomPhoto = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bedPhoto = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  room = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    label: '101',
    wholeRoomAvailable: null,
    photoIds: [roomPhoto],
  },
  bed = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    label: 'A',
    available: null,
    photoIds: [bedPhoto],
    monthlyRentPaisa: 1234500,
    depositPaisa: 500001,
  };
it('ROOM-004: customers see the room photos and the specific bed photo before quoting', async () => {
  await render(
    <PublicInventoryRoomOptions
      rows={[room]}
      beds={[bed]}
      selectedRoom={room}
      whole={false}
      perBed
      roomDisabled={false}
      bedDisabled={false}
      bedsPending={false}
      chooseRoom={jest.fn()}
      chooseTarget={jest.fn()}
    />,
  );
  expect(screen.getByLabelText('Room 101 photo 1').props.source).toEqual({
    uri: 'https://example.test/v1/marketplace/media/' + roomPhoto,
  });
  expect(screen.getByLabelText('Bed A photo 1').props.source).toEqual({
    uri: 'https://example.test/v1/marketplace/media/' + bedPhoto,
  });
  expect(screen.getByText(/Security.*5,000\.01/)).toBeTruthy();
  expect(screen.getByText(/12,345/)).toBeTruthy();
});
