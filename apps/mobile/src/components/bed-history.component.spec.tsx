/// <reference types="jest" />
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBedHistory } from '@hsm/api-client';
import { NativeBedHistory } from './bed-history';
const mockRecord = jest.fn((props: unknown) => {
  void props;
  return null;
});
jest.mock('./staff-stay-workspace', () => ({
  StaffStayWorkspace: (props: unknown) => mockRecord(props),
}));
jest.mock('@hsm/api-client', () => ({ readBedHistory: jest.fn() }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn().mockResolvedValue({}) }));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
const row = {
  assignmentId: 'old-assignment',
  stayId: 'original-stay',
  residentName: 'Former resident',
  startedAt: '2026-10-01T10:00:00.000Z',
  endedAt: '2026-10-28T10:00:00.000Z',
  wholeRoom: false,
};
it('RES-005: opens the original departed stay and preserves history when returning', async () => {
  jest
    .mocked(readBedHistory)
    .mockResolvedValue({ branchId: 'branch', bedId: 'bed', data: [row], nextCursor: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <NativeBedHistory actorId="owner" branchId="branch" bedId="bed" />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: /^Former resident, In / }));
  expect(mockRecord).toHaveBeenCalledWith({
    actorId: 'owner',
    branchId: 'branch',
    stayId: 'original-stay',
    onClose: expect.any(Function),
  });
  await act(() => (mockRecord.mock.calls.at(-1)?.[0] as { onClose: () => void }).onClose());
  expect(screen.getByRole('button', { name: /^Former resident, In / })).toBeTruthy();
  expect(readBedHistory).toHaveBeenCalledTimes(1);
  view.unmount();
  client.clear();
});
