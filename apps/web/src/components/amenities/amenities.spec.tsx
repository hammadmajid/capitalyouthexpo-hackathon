import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  listApprovedAmenities,
  readCustomAmenities,
  readRoomLevelAmenities,
  saveCustomAmenity,
  saveRoomLevelAmenities,
} from '@hsm/api-client';
import { CustomAmenities } from './custom-amenities';
import { RoomAmenities } from './room-amenities';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readCustomAmenities: vi.fn(),
  saveCustomAmenity: vi.fn(),
  listApprovedAmenities: vi.fn(),
  readRoomLevelAmenities: vi.fn(),
  saveRoomLevelAmenities: vi.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  version = 'a'.repeat(64);
function custom(code: string, name: string, isActive = true) {
  return { code, name, category: 'facilities', isActive, version, organizationId: branchId };
}
function catalog(canEdit: boolean) {
  vi.mocked(readCustomAmenities).mockResolvedValue({
    branchId,
    organizationId: branchId,
    canEdit,
    nextCursor: null,
    data: [
      custom('laundry', 'Laundry room'),
      custom('gym', 'Gym corner', false),
      custom('pool', 'Pool', false),
    ],
  } as never);
}
function wrap(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
function Picker({ initial }: { initial: string[] }) {
  const [codes, setCodes] = useState(initial);
  return (
    <>
      <CustomAmenities actorId="owner" branchId={branchId} selected={codes} change={setCodes} />
      <output data-testid="codes">{codes.join(',')}</output>
    </>
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('LIST-00x: archived custom amenities stay visible only while selected', async () => {
  catalog(true);
  const user = userEvent.setup();
  render(wrap(<Picker initial={['gym']} />));
  await user.click(await screen.findByLabelText('Laundry room'));
  expect(screen.getByTestId('codes').textContent).toBe('gym,laundry');
  expect(screen.getByLabelText('Gym corner · Archived')).toBeTruthy();
  expect(screen.queryByText(/Pool/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Gym corner' })).toBeNull();
});
it('LIST-00x: an Owner creates, edits and archives a custom amenity', async () => {
  catalog(true);
  vi.mocked(saveCustomAmenity).mockResolvedValue(custom('laundry', 'Laundry') as never);
  const user = userEvent.setup();
  render(wrap(<Picker initial={[]} />));
  await user.click(await screen.findByRole('button', { name: 'Add custom amenity' }));
  await user.type(screen.getByLabelText('Custom amenity name'), 'Prayer room');
  await user.selectOptions(screen.getByLabelText('Category'), 'facilities');
  await user.click(screen.getByRole('button', { name: 'Save amenity' }));
  await waitFor(() => expect(saveCustomAmenity).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveCustomAmenity).mock.calls[0]?.slice(1, 3)).toEqual([
    branchId,
    { kind: 'create', name: 'Prayer room', category: 'facilities' },
  ]);
  await user.click(await screen.findByRole('button', { name: 'Edit Laundry room' }));
  await user.click(screen.getByRole('button', { name: 'Archive amenity' }));
  await waitFor(() => expect(saveCustomAmenity).toHaveBeenCalledTimes(2));
  expect(vi.mocked(saveCustomAmenity).mock.calls[1]?.[2]).toEqual({
    kind: 'archive',
    code: 'laundry',
    version,
    reason: 'Owner removed amenity from available offerings',
  });
});
it('SEC-001: without an edit grant custom amenities are view only', async () => {
  catalog(false);
  render(wrap(<Picker initial={[]} />));
  await screen.findByLabelText('Laundry room');
  expect(screen.queryByRole('button', { name: 'Add custom amenity' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Laundry room' })).toBeNull();
});
function room(canEdit: boolean, codes: string[]) {
  const amenities = codes.map((code) => ({ code, name: code, isActive: true }));
  vi.mocked(readRoomLevelAmenities).mockResolvedValue({
    branchId,
    roomId,
    roomTypeId: roomId,
    customized: true,
    version,
    canEdit,
    amenities,
    typeAmenities: amenities,
  } as never);
  vi.mocked(listApprovedAmenities).mockResolvedValue({
    data: [
      { code: 'air_conditioning', name: 'Air conditioning' },
      { code: 'attached_bath', name: 'Attached bath' },
      { code: 'wifi', name: 'Wi-Fi' },
    ],
    nextCursor: null,
  } as never);
  catalog(canEdit);
}
it('ROOM-AMN: a room offers only in-room amenities and saves its own versioned set', async () => {
  room(true, ['attached_bath']);
  vi.mocked(saveRoomLevelAmenities).mockResolvedValue({} as never);
  const user = userEvent.setup();
  render(wrap(<RoomAmenities actorId="owner" branchId={branchId} roomId={roomId} />));
  const bath = await screen.findByLabelText<HTMLInputElement>('Attached bath');
  expect(bath.checked).toBe(true);
  expect(screen.queryByLabelText('Wi-Fi')).toBeNull();
  const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save room amenities' });
  expect(save.disabled).toBe(true);
  await user.click(screen.getByLabelText('Air conditioning'));
  await user.click(await screen.findByLabelText('Laundry room'));
  await user.click(save);
  await waitFor(() => expect(saveRoomLevelAmenities).toHaveBeenCalledTimes(1));
  const [, sentBranch, sentRoom, sentVersion, body, key] =
    vi.mocked(saveRoomLevelAmenities).mock.calls[0] ?? [];
  expect([sentBranch, sentRoom, sentVersion]).toEqual([branchId, roomId, version]);
  expect(body).toEqual({
    mode: 'custom',
    amenityCodes: ['attached_bath', 'air_conditioning', 'laundry'],
  });
  expect(typeof key).toBe('string');
});
it('SEC-001: a room without an edit grant cannot save amenities', async () => {
  room(false, []);
  render(wrap(<RoomAmenities actorId="owner" branchId={branchId} roomId={roomId} />));
  const ac = await screen.findByLabelText<HTMLInputElement>('Air conditioning');
  expect(ac.disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save room amenities' })).toBeNull();
});
