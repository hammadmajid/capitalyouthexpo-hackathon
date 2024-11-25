import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PublicInventoryRoomOptions } from './public-inventory-room-options';
afterEach(cleanup);
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
it('ROOM-004: customers see the room photos and the specific bed photo before quoting', () => {
  render(
    <PublicInventoryRoomOptions
      rows={[room]}
      beds={[bed]}
      selectedRoom={room}
      whole={false}
      perBed
      roomDisabled={false}
      bedDisabled={false}
      bedsPending={false}
      chooseRoom={vi.fn()}
      chooseTarget={vi.fn()}
    />,
  );
  expect(screen.getByRole('img', { name: 'Room 101 photo 1' }).getAttribute('src')).toContain(
    '/api/v1/marketplace/media/' + roomPhoto,
  );
  expect(screen.getByRole('img', { name: 'Bed A photo 1' }).getAttribute('src')).toContain(
    '/api/v1/marketplace/media/' + bedPhoto,
  );
  expect(screen.getByText(/Security.*5,000\.01/)).toBeTruthy();
  expect(screen.getByText(/12,345/)).toBeTruthy();
});
