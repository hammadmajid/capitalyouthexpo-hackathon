import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  executeVisitCommand: vi.fn(),
  listOwnVisits: vi.fn(),
  listBranchVisits: vi.fn(),
  readVisitingHours: vi.fn(),
  readVisitSlots: vi.fn(),
  readVisitHistory: vi.fn(),
  readVisitInterest: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./providers', () => ({
  useSession: () => ({
    data: { user: { id: actorId }, capabilities: { customer: true } },
    isPending: false,
    error: null,
  }),
}));
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
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeVisitCommand).mockReset();
  vi.mocked(listOwnVisits).mockReset();
  vi.mocked(listOwnVisits).mockResolvedValue({ data: [row], nextCursor: null });
  vi.mocked(listBranchVisits).mockResolvedValue({ data: [row], nextCursor: null });
  vi.mocked(readVisitingHours).mockResolvedValue({
    branchId,
    version: 'a'.repeat(64),
    windows: [],
  });
  vi.mocked(readVisitSlots).mockResolvedValue({
    branchId,
    date: '2026-11-05',
    windows: [{ dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' }],
  });
  vi.mocked(executeVisitCommand).mockResolvedValue(row);
});
it('VISIT-001: private visits load lazily and a failed revalidation hides cached facts', async () => {
  const client = mount(<Visits actorId={actorId} />);
  expect(listOwnVisits).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'My visits' }));
  assertVisible(await screen.findByText('Green View Hostel'));
  vi.mocked(listOwnVisits).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await client.refetchQueries({ queryKey: ['visits', actorId] });
  assertVisible(await screen.findByRole('button', { name: 'Refresh visit access' }));
  expect(screen.queryByText('Green View Hostel')).toBeNull();
});
it('VISIT-001: requesting a current hostel time submits explicit Karachi time and retains uncertain intent', async () => {
  vi.mocked(executeVisitCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(row);
  mount(<VisitRequest branchId={branchId} slug="real-hostel" />);
  fireEvent.change(screen.getByLabelText('Visit date'), { target: { value: '2026-11-05' } });
  fireEvent.change(screen.getByLabelText('Visit time'), { target: { value: '10:00' } });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send visit request' })).toHaveProperty(
      'disabled',
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Send visit request' }));
  const retry = await screen.findByRole('button', { name: 'Retry original visit request' });
  expect(screen.getByLabelText('Visit date')).toHaveProperty('disabled', true);
  fireEvent.click(retry);
  await waitFor(() => expect(executeVisitCommand).toHaveBeenCalledTimes(2));
  expect(vi.mocked(executeVisitCommand).mock.calls[0]).toEqual(
    vi.mocked(executeVisitCommand).mock.calls[1],
  );
  expect(vi.mocked(executeVisitCommand).mock.calls[0]?.[1]).toEqual({
    kind: 'request',
    body: { branchId, requestedStart: '2026-11-05T05:00:00.000Z' },
  });
});
it('VISIT-001: a foreign public-window response cannot submit a request for the selected hostel', async () => {
  vi.mocked(readVisitSlots).mockResolvedValue({
    branchId: actorId,
    date: '2026-11-05',
    windows: [{ dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' }],
  });
  mount(<VisitRequest branchId={branchId} slug="real-hostel" />);
  fireEvent.change(screen.getByLabelText('Visit date'), { target: { value: '2026-11-05' } });
  assertVisible(
    await screen.findByText(
      'Hostel details changed. Reload this hostel before requesting a visit.',
    ),
  );
  expect(screen.getByRole('button', { name: 'Send visit request' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(executeVisitCommand).not.toHaveBeenCalled();
});
it('VISIT-001: staff configuration requires explicit times and does not invent opening hours', async () => {
  mount(<Visits actorId={actorId} branchId={branchId} />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage visits' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add visiting window' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save visiting hours' }));
  assertVisible(await screen.findByText('Use ordered, non-overlapping visiting windows.'));
  expect(executeVisitCommand).not.toHaveBeenCalled();
});

function assertVisible(element: HTMLElement) {
  expect(element.isConnected).toBe(true);
  let current: HTMLElement | null = element;
  while (current) {
    expect(current.hidden).toBe(false);
    const style = getComputedStyle(current);
    expect(style.display).not.toBe('none');
    expect(['hidden', 'collapse']).not.toContain(style.visibility);
    expect(style.opacity).not.toBe('0');
    current = current.parentElement;
  }
}

it('VISIT-001 / SEC-003: readable visit history is lazy and hidden when private revalidation fails', async () => {
  vi.mocked(readVisitHistory).mockResolvedValue({
    visitId: row.id,
    branchId,
    branchName: 'Private visit hostel',
    customerName: 'Private visitor name',
    data: [],
    nextCursor: null,
  });
  const cache = mount(<Visits actorId={actorId} />);
  fireEvent.click(screen.getByText('My visits'));
  fireEvent.click(await screen.findByText('View visit history'));
  expect(await screen.findByText('Private visit hostel · Private visitor name')).toBeTruthy();
  vi.mocked(readVisitHistory).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await cache.refetchQueries({ queryKey: ['visits', actorId] });
  expect(await screen.findByText('Refresh history access')).toBeTruthy();
  expect(screen.queryByText('Private visit hostel · Private visitor name')).toBeNull();
});
it('VISIT-001: a completed-visit response retains the reviewed version and original negative decision on retry', async () => {
  vi.mocked(listOwnVisits).mockResolvedValue({
    data: [{ ...row, status: 'completed' }],
    nextCursor: null,
  });
  vi.mocked(readVisitInterest).mockResolvedValue({
    visitId: row.id,
    branchId,
    expectedUpdatedAt: row.updatedAt,
    promptedAt: null,
    stillInterested: null,
    respondedAt: null,
  });
  vi.mocked(executeVisitCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({
      visitId: row.id,
      branchId,
      expectedUpdatedAt: '2026-10-22T03:00:00.001Z',
      promptedAt: null,
      stillInterested: false,
      respondedAt: row.updatedAt,
    });
  mount(<Visits actorId={actorId} />);
  fireEvent.click(screen.getByText('My visits'));
  fireEvent.click(await screen.findByText('Not interested'));
  fireEvent.click(await screen.findByText('Retry original visit response'));
  await waitFor(() => expect(executeVisitCommand).toHaveBeenCalledTimes(2));
  const first = vi.mocked(executeVisitCommand).mock.calls[0];
  expect(first?.[1]).toEqual({
    kind: 'interest',
    visitId: row.id,
    body: { expectedUpdatedAt: row.updatedAt, stillInterested: false },
  });
  expect(first).toEqual(vi.mocked(executeVisitCommand).mock.calls[1]);
});

it('VISIT-001: pending parent refresh cannot discard an uncertain post-visit command', async () => {
  const page = { data: [{ ...row, status: 'completed' as const }], nextCursor: null };
  vi.mocked(listOwnVisits).mockResolvedValue(page);
  vi.mocked(readVisitInterest).mockResolvedValue({
    visitId: row.id,
    branchId,
    expectedUpdatedAt: row.updatedAt,
    promptedAt: null,
    stillInterested: null,
    respondedAt: null,
  });
  vi.mocked(executeVisitCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(row);
  let finish: () => void = () => {
    throw Error('Refresh not prepared');
  };
  const refresh = new Promise<typeof page>((resolve) => {
    finish = () => resolve(page);
  });
  mount(<Visits actorId={actorId} />);
  fireEvent.click(screen.getByText('My visits'));
  await screen.findByText('Not interested');
  vi.mocked(listOwnVisits).mockReturnValueOnce(refresh);
  fireEvent.click(screen.getByText('Not interested'));
  await screen.findByText('Loading current visits…');
  await act(async () => {
    finish();
    await refresh;
  });
  fireEvent.click(await screen.findByText('Retry original visit response'));
  await waitFor(() => expect(executeVisitCommand).toHaveBeenCalledTimes(2));
  expect(vi.mocked(executeVisitCommand).mock.calls[0]).toEqual(
    vi.mocked(executeVisitCommand).mock.calls[1],
  );
});
