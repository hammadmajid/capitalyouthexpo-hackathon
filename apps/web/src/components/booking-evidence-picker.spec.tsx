import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { submitBookingDocument } from '@hsm/api-client';
import { BookingEvidencePicker } from './booking-evidence-picker';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  submitBookingDocument: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const fileId = randomUUID(),
  branchId = randomUUID(),
  actorId = randomUUID();
vi.mock('./private-file-input', () => ({
  PrivateFileInput: ({
    onReady,
    disabled,
    purpose,
  }: {
    onReady: (id: string) => void;
    disabled: boolean;
    purpose: string;
  }) => (
    <button disabled={disabled} onClick={() => onReady(fileId)}>
      Clean {purpose} fixture
    </button>
  ),
}));
const evidence = {
  id: randomUUID(),
  branchId,
  bookingId: null,
  kind: 'student_id' as const,
  state: 'pending' as const,
  createdAt: '2026-10-17T00:00:00.000Z',
  reviewedAt: null,
  rejectionCode: null,
  fileId,
  consumedAt: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(submitBookingDocument).mockResolvedValue(evidence);
});
afterEach(cleanup);
function setup(consent = true) {
  const onReady = vi.fn(),
    onBusy = vi.fn(),
    cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const tree = (actor = actorId, branch = branchId) => (
    <QueryClientProvider client={cache}>
      <BookingEvidencePicker
        actorId={actor}
        branchId={branch}
        kind="student_id"
        consent={consent}
        disabled={false}
        onReady={onReady}
        onBusy={onBusy}
      />
    </QueryClientProvider>
  );
  return { ...render(tree()), tree, onReady, onBusy };
}
const pick = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Clean resident_document fixture' }));
it('BKG-005 / CHG-008: a clean private upload alone never shares evidence or selects it for booking', () => {
  const value = setup();
  pick();
  expect(submitBookingDocument).not.toHaveBeenCalled();
  expect(value.onReady).toHaveBeenLastCalledWith(undefined);
  expect(screen.getByRole('button', { name: 'Share Student ID with Owner' })).toBeDefined();
});
it('BKG-005 / CHG-008: Owner sharing requires explicit consent even after a clean upload', () => {
  setup(false);
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Share Student ID with Owner' }));
  expect(submitBookingDocument).not.toHaveBeenCalled();
});
it('BKG-005: readiness follows only actual matching persisted evidence and no private IDs are rendered', async () => {
  const value = setup();
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Share Student ID with Owner' }));
  await screen.findByText('Shared privately with this hostel Owner for verification.');
  expect(submitBookingDocument).toHaveBeenCalledWith(
    {},
    branchId,
    { kind: 'student_id', fileId, shareWithOwner: true },
    expect.any(String),
  );
  expect(value.onReady).toHaveBeenLastCalledWith(fileId);
  expect(value.onBusy.mock.calls).toEqual([[true], [false]]);
  for (const id of [fileId, evidence.id, actorId])
    expect(document.body.textContent).not.toContain(id);
});
it('BKG-005: interrupted sharing preserves the exact file and idempotency key for retry', async () => {
  vi.mocked(submitBookingDocument).mockRejectedValue(new Error('Private provider detail'));
  const value = setup();
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Share Student ID with Owner' }));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Share Student ID with Owner' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Share Student ID with Owner' }));
  await waitFor(() => expect(submitBookingDocument).toHaveBeenCalledTimes(2));
  expect(vi.mocked(submitBookingDocument).mock.calls[1]?.[3]).toBe(
    vi.mocked(submitBookingDocument).mock.calls[0]?.[3],
  );
  expect(value.onReady).not.toHaveBeenCalledWith(fileId);
  expect(document.body.textContent).not.toContain('Private provider detail');
});
it.each([
  { branchId: randomUUID() },
  { fileId: randomUUID() },
  { kind: 'cnic' as const },
  { bookingId: randomUUID() },
  { consumedAt: '2026-10-17T00:00:01.000Z' },
  {
    state: 'rejected' as const,
    reviewedAt: '2026-10-17T00:00:01.000Z',
    rejectionCode: 'wrong_document',
  },
])('SEC-003: a mismatched or consumed sharing result never enables checkout %#', async (change) => {
  vi.mocked(submitBookingDocument).mockResolvedValue({ ...evidence, ...change });
  const value = setup();
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Share Student ID with Owner' }));
  await screen.findByRole('alert');
  expect(value.onReady).not.toHaveBeenCalledWith(fileId);
  expect(
    screen.queryByText('Shared privately with this hostel Owner for verification.'),
  ).toBeNull();
});
it('SEC-003: changing account/branch discards previously uploaded sharing selection', async () => {
  const value = setup();
  pick();
  value.rerender(value.tree(randomUUID(), randomUUID()));
  expect(screen.queryByRole('button', { name: 'Share Student ID with Owner' })).toBeNull();
});
