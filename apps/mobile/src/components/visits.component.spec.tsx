import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClientFailure,
  executeVisitCommand,
  listOwnVisits,
  listBranchVisits,
  readVisitingHours,
  readVisitSlots,
  readVisitHistory,
  readVisitInterest,
} from '@hsm/api-client';
import { Visits } from './visits';
import { VisitRequest } from './visit-request';
import { pickDate } from '../test-utils/pick-date';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  executeVisitCommand: jest.fn(),
  listOwnVisits: jest.fn(),
  listBranchVisits: jest.fn(),
  readVisitingHours: jest.fn(),
  readVisitSlots: jest.fn(),
  readVisitHistory: jest.fn(),
  readVisitInterest: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '019a1234-1234-7123-8123-123456789abc' }));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}), client: {} }));
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002';
const row = {
  branchName: 'Green View Hostel',
  customerName: 'Test Customer',
  id: '10000000-0000-4000-8000-000000000003',
  branchId,
  status: 'requested' as const,
  requestedStart: '2026-11-05T05:00:00.000Z',
  proposedStart: null,
  reason: null,
  createdAt: '2026-10-22T03:00:00.000Z',
  updatedAt: '2026-10-22T03:00:00.000Z',
};
async function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  await render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
afterEach(cleanup);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(executeVisitCommand).mockReset();
  jest.mocked(listOwnVisits).mockReset();
  jest.mocked(listOwnVisits).mockResolvedValue({ data: [row], nextCursor: null });
  jest.mocked(listBranchVisits).mockResolvedValue({ data: [row], nextCursor: null });
  jest
    .mocked(readVisitingHours)
    .mockResolvedValue({ branchId, version: 'a'.repeat(64), windows: [] });
  jest.mocked(readVisitSlots).mockResolvedValue({
    branchId,
    date: '2026-11-05',
    windows: [{ dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' }],
  });
  jest.mocked(executeVisitCommand).mockResolvedValue(row);
});
it('VISIT-001: native private visits are lazy and failed authority revalidation hides cached facts', async () => {
  const client = await mount(<Visits actorId={actorId} />);
  expect(listOwnVisits).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('My visits'));
  expect(await screen.findByText('Green View Hostel')).toBeTruthy();
  jest.mocked(listOwnVisits).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await client.refetchQueries({ queryKey: ['visits', actorId] });
  });
  expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Green View Hostel')).toBeNull();
});
it('VISIT-001: native request retains original command after an uncertain response', async () => {
  jest
    .mocked(executeVisitCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(row);
  await mount(
    <VisitRequest actorId={actorId} branchId={branchId} slug="real-hostel" signIn={jest.fn()} />,
  );
  await pickDate('Visit date', '2028-11-02');
  await fireEvent.press(await screen.findByRole('button', { name: 'Visit time 10:00 AM' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send visit request' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByText('Send visit request'));
  await fireEvent.press(await screen.findByText('Retry original visit request'));
  await waitFor(() => expect(executeVisitCommand).toHaveBeenCalledTimes(2));
  expect(jest.mocked(executeVisitCommand).mock.calls[0]).toEqual(
    jest.mocked(executeVisitCommand).mock.calls[1],
  );
});
it('VISIT-001: unauthenticated native visitors are offered the existing sign-in transition', async () => {
  const signIn = jest.fn();
  await mount(<VisitRequest branchId={branchId} slug="real-hostel" signIn={signIn} />);
  await fireEvent.press(await screen.findByText('Sign in to request a visit'));
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(readVisitSlots).not.toHaveBeenCalled();
  expect(executeVisitCommand).not.toHaveBeenCalled();
});

it('VISIT-001 / SEC-003: native visit history binds private scope and hides facts after failed revalidation', async () => {
  jest.mocked(readVisitHistory).mockResolvedValue({
    visitId: row.id,
    branchId,
    branchName: 'Private visit hostel',
    customerName: 'Private visitor name',
    data: [],
    nextCursor: null,
  });
  const cache = await mount(<Visits actorId={actorId} />);
  await fireEvent.press(await screen.findByText('My visits'));
  await fireEvent.press(await screen.findByText('View visit history'));
  expect(await screen.findByText('Private visit hostel · Private visitor name')).toBeTruthy();
  jest.mocked(readVisitHistory).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await cache.refetchQueries({ queryKey: ['visits', actorId] });
  });
  expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Private visit hostel · Private visitor name')).toBeNull();
});
it('VISIT-001: native post-visit response retains the exact reviewed negative decision after uncertainty', async () => {
  jest
    .mocked(listOwnVisits)
    .mockResolvedValue({ data: [{ ...row, status: 'completed' }], nextCursor: null });
  jest.mocked(readVisitInterest).mockResolvedValue({
    visitId: row.id,
    branchId,
    expectedUpdatedAt: row.updatedAt,
    promptedAt: null,
    stillInterested: null,
    respondedAt: null,
  });
  jest
    .mocked(executeVisitCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({
      visitId: row.id,
      branchId,
      expectedUpdatedAt: '2026-10-22T03:00:00.001Z',
      promptedAt: null,
      stillInterested: false,
      respondedAt: row.updatedAt,
    });
  await mount(<Visits actorId={actorId} />);
  await fireEvent.press(await screen.findByText('My visits'));
  await fireEvent.press(await screen.findByText('Not interested'));
  await fireEvent.press(await screen.findByText('Retry original visit response'));
  await waitFor(() => expect(executeVisitCommand).toHaveBeenCalledTimes(2));
  const first = jest.mocked(executeVisitCommand).mock.calls[0];
  expect(first?.[1]).toEqual({
    kind: 'interest',
    visitId: row.id,
    body: { expectedUpdatedAt: row.updatedAt, stillInterested: false },
  });
  expect(first).toEqual(jest.mocked(executeVisitCommand).mock.calls[1]);
});

it('VISIT-001: native pending parent refresh cannot discard an uncertain post-visit command', async () => {
  const page = { data: [{ ...row, status: 'completed' as const }], nextCursor: null };
  jest.mocked(listOwnVisits).mockResolvedValue(page);
  jest.mocked(readVisitInterest).mockResolvedValue({
    visitId: row.id,
    branchId,
    expectedUpdatedAt: row.updatedAt,
    promptedAt: null,
    stillInterested: null,
    respondedAt: null,
  });
  jest
    .mocked(executeVisitCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(row);
  let finish: () => void = () => {
    throw Error('Refresh not prepared');
  };
  const refresh = new Promise<typeof page>((resolve) => {
    finish = () => resolve(page);
  });
  await mount(<Visits actorId={actorId} />);
  await fireEvent.press(await screen.findByText('My visits'));
  await screen.findByText('Not interested');
  jest.mocked(listOwnVisits).mockReturnValueOnce(refresh);
  await fireEvent.press(screen.getByText('Not interested'));
  await screen.findByLabelText('Loading current visits…');
  await act(async () => {
    finish();
    await refresh;
  });
  await fireEvent.press(await screen.findByText('Retry original visit response'));
  await waitFor(() => expect(executeVisitCommand).toHaveBeenCalledTimes(2));
  expect(jest.mocked(executeVisitCommand).mock.calls[0]).toEqual(
    jest.mocked(executeVisitCommand).mock.calls[1],
  );
});
