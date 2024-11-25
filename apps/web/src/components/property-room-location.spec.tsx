import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  readPropertyRoomLocation,
  savePropertyRoomLocation,
  readPropertyBuildings,
  ApiFailure,
} from '@hsm/api-client';
import {
  branch,
  buildingId,
  floor,
  roomId,
  location,
  propertyFixture,
} from '../../test/unit/property.fixture';
import { PropertyRoomLocation } from './property-room-location';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readPropertyBuildings: vi.fn(),
  readPropertyFloors: vi.fn(),
  readPropertyRoomLocation: vi.fn(),
  savePropertyRoomLocation: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());
function mount() {
  const f = propertyFixture();
  return {
    ...render(
      <QueryClientProvider client={f.cache}>
        <PropertyRoomLocation
          actorId={f.actorId}
          branchId={branch}
          roomId={roomId}
          roomLabel="101"
          disabled={false}
        />
      </QueryClientProvider>,
    ),
    ...f,
  };
}
async function selectFloor() {
  fireEvent.click(screen.getByRole('button', { name: 'Room 101 location' }));
  await screen.findByRole('option', { name: 'Actual block' });
  fireEvent.change(screen.getByLabelText('Property building'), { target: { value: buildingId } });
  await screen.findByRole('option', { name: 'Ground · Level 0' });
  fireEvent.change(screen.getByLabelText('Property floor'), { target: { value: floor.id } });
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Assign selected floor' }).disabled,
    ).toBe(false),
  );
}
const classified = {
  ...location,
  version: 2,
  floor: { id: floor.id, label: floor.label, buildingId, buildingName: 'Actual block' },
};
it('PROP / RPT-001 / AUD-010: exact room location is versioned and saved only after the matching read refreshes', async () => {
  mount();
  await selectFloor();
  fireEvent.change(screen.getByLabelText('Room location reason'), {
    target: { value: 'Correct actual classification' },
  });
  vi.mocked(savePropertyRoomLocation).mockImplementation(async () => {
    vi.mocked(readPropertyRoomLocation).mockResolvedValue(classified);
    return classified;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Assign selected floor' }));
  await screen.findByText('Room location saved and refreshed.');
  expect(savePropertyRoomLocation).toHaveBeenCalledWith(
    {},
    branch,
    roomId,
    { expectedVersion: 1, floorId: floor.id, reason: 'Correct actual classification' },
    expect.any(String),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use current room version' }));
  vi.mocked(savePropertyRoomLocation).mockImplementation(async () => {
    const next = { ...location, version: 3 };
    vi.mocked(readPropertyRoomLocation).mockResolvedValue(next);
    return next;
  });
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Clear room classification' }).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear room classification' }));
  await waitFor(() =>
    expect(savePropertyRoomLocation).toHaveBeenLastCalledWith(
      {},
      branch,
      roomId,
      { expectedVersion: 2, floorId: null, reason: 'Correct actual classification' },
      expect.any(String),
    ),
  );
});
it('ACC-004 / AUD-003/010: uncertain location command retries its original branch, room, version, reason and key', async () => {
  mount();
  await selectFloor();
  vi.mocked(savePropertyRoomLocation)
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockImplementation(async () => {
      vi.mocked(readPropertyRoomLocation).mockResolvedValue(classified);
      return classified;
    });
  fireEvent.change(screen.getByLabelText('Room location reason'), {
    target: { value: 'Once only correction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Assign selected floor' }));
  await screen.findByRole('button', { name: 'Retry previous request' });
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Close room location' }).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry previous request' }));
  await screen.findByText('Room location saved and refreshed.');
  expect(vi.mocked(savePropertyRoomLocation).mock.calls[1]).toEqual(
    vi.mocked(savePropertyRoomLocation).mock.calls[0],
  );
});
it('ACC-004 / AUD-010: a concurrent location version retains reason and requires explicit reload', async () => {
  const f = mount();
  await selectFloor();
  fireEvent.change(screen.getByLabelText('Room location reason'), {
    target: { value: 'Keep entered reason' },
  });
  vi.mocked(readPropertyRoomLocation).mockResolvedValue(classified);
  await act(async () => {
    await f.cache.invalidateQueries({ queryKey: ['property-room-location', f.actorId, branch] });
  });
  await screen.findByRole('button', { name: 'Use current room version' });
  expect(screen.getByLabelText<HTMLInputElement>('Room location reason').value).toBe(
    'Keep entered reason',
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Assign selected floor' }).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Use current room version' }));
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Assign selected floor' }).disabled,
    ).toBe(false),
  );
  expect(savePropertyRoomLocation).not.toHaveBeenCalled();
});
it('SEC-003 / AUD-010: failed parent authority hides cached metadata and blocks correction', async () => {
  const f = mount();
  await selectFloor();
  vi.mocked(readPropertyBuildings).mockRejectedValue(
    new ApiFailure({
      type: 'urn:hsm:error:not_found',
      title: 'Unavailable',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Unavailable',
      traceId: 'synthetic',
    }),
  );
  await act(async () => {
    await f.cache.invalidateQueries({ queryKey: ['property-pages', f.actorId, branch] });
  });
  await screen.findByRole('alert');
  expect(screen.queryByRole('option', { name: 'Actual block' })).toBeNull();
  expect(screen.queryByLabelText('Room location reason')).toBeNull();
  expect(savePropertyRoomLocation).not.toHaveBeenCalled();
});
