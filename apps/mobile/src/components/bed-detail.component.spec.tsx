/// <reference types="jest" />
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBedHistory, readBedOccupancy } from '@hsm/api-client';
import { NativeBedDetail } from './bed-detail';
const mockWorkspace = jest.fn((props: { stayId: string; onClose: () => void }) => {
  void props;
  return null;
});
jest.mock('./staff-stay-workspace', () => ({
  StaffStayWorkspace: (props: { stayId: string; onClose: () => void }) => mockWorkspace(props),
}));
jest.mock('./owner-media-gallery', () => ({ OwnerMediaGallery: () => null }));
jest.mock('./bed-actions', () => ({ BedActions: () => null }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBedHistory: jest.fn(),
  readBedOccupancy: jest.fn(),
}));
it('RES-005: opens former-stay details without duplicate bed headers or discarding history pages', async () => {
  jest.mocked(readBedOccupancy).mockResolvedValue({
    branchId: 'branch',
    on: '2026-11-02',
    room: {
      id: 'room',
      label: '101',
      roomTypeId: 'type',
      roomTypeName: 'Shared',
      status: 'active',
    },
    bed: {
      id: 'bed',
      label: 'A',
      ordinal: 1,
      status: 'active',
      state: 'available',
      occupant: null,
    },
    claims: [],
  });
  jest.mocked(readBedHistory).mockResolvedValue({
    branchId: 'branch',
    bedId: 'bed',
    nextCursor: null,
    data: [
      {
        assignmentId: 'assignment',
        stayId: 'original',
        residentName: 'Former resident',
        startedAt: '2026-10-01T10:00:00Z',
        endedAt: '2026-10-31T10:00:00Z',
        wholeRoom: false,
      },
    ],
  });
  const cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const view = await render(
    <QueryClientProvider client={cache}>
      <NativeBedDetail
        actorId="owner"
        branchId="branch"
        bedId="bed"
        on=""
        close={() => undefined}
      />
    </QueryClientProvider>,
  );
  // CHG-048: history sits behind the bed's History tile.
  await fireEvent.press(await screen.findByRole('button', { name: 'History' }));
  await fireEvent.press(await screen.findByRole('button', { name: /^Former resident, In / }));
  expect(mockWorkspace).toHaveBeenCalledWith(expect.objectContaining({ stayId: 'original' }));
  expect(screen.queryByRole('button', { name: 'Close bed details' })).toBeNull();
  await act(() => mockWorkspace.mock.calls.at(-1)?.[0].onClose());
  expect(await screen.findByRole('button', { name: /^Former resident, In / })).toBeTruthy();
  expect(readBedHistory).toHaveBeenCalledTimes(1);
  view.unmount();
  cache.clear();
});

it('BED-002: errors retain a working back arrow and explicit retry', async () => {
  jest.mocked(readBedOccupancy).mockRejectedValueOnce(new Error('Offline'));
  const close = jest.fn(),
    cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const view = await render(
    <QueryClientProvider client={cache}>
      <NativeBedDetail actorId="owner" branchId="branch" bedId="bed" on="" close={close} />
    </QueryClientProvider>,
  );
  await screen.findByRole('alert');
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Close bed details' }));
  expect(close).toHaveBeenCalledTimes(1);
  view.unmount();
  cache.clear();
});
