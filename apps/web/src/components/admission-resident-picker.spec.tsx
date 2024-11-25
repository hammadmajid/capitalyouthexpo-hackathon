import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readStaffStays, ClientFailure } from '@hsm/api-client';
import { staySummarySchema, type ManualStayInput } from '@hsm/contracts';
import { AdmissionResidentPicker } from './admission-resident-picker';
import { admissionUiId as id, admissionUiOther as other } from './admission-ui.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readStaffStays: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const caches: QueryClient[] = [];
function row() {
  return staySummarySchema.parse({
    id,
    branchId: id,
    residentId: other,
    displayName: 'Existing resident',
    source: 'manual',
    state: 'completed',
    version: 1,
    moveInDate: '2028-01-01',
    expectedLeaveDate: '2028-02-01',
    checkedInAt: '2028-01-01T10:00:00.000Z',
    closedAt: '2028-02-01T10:00:00.000Z',
    currentAssignment: null,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readStaffStays).mockResolvedValue({ data: [row()], nextCursor: null });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function fixture() {
  const onChoose = vi.fn<(resident: ManualStayInput['resident'], label: string) => void>(),
    onCancel = vi.fn();
  const props = {
    actorId: id,
    branchId: id,
    branchLabel: 'Garden branch',
    pending: false,
    unavailable: false,
    onChoose,
    onCancel,
  };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const show = (next = props) => (
    <QueryClientProvider client={cache}>
      <AdmissionResidentPicker {...next} />
    </QueryClientProvider>
  );
  return { ...render(show()), show, props, onChoose, onCancel };
}
it('RES-001: source must be chosen explicitly and new offline contacts never trigger account lookup', () => {
  const f = fixture();
  expect(readStaffStays).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'New offline resident' }));
  fireEvent.change(screen.getByLabelText('Resident name'), {
    target: { value: '  New resident  ' },
  });
  fireEvent.change(screen.getByLabelText('Resident email (optional)'), {
    target: { value: 'RESIDENT@EXAMPLE.COM' },
  });
  // CHG-054: a new walk-in resident cannot continue without a complete CNIC.
  fireEvent.click(screen.getByRole('button', { name: 'Continue with offline resident' }));
  expect(f.onChoose).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toMatch(/13-digit CNIC/);
  fireEvent.change(screen.getByLabelText('Resident CNIC'), { target: { value: '3520212345671' } });
  expect(screen.getByLabelText<HTMLInputElement>('Resident CNIC').value).toBe('35202-1234567-1');
  fireEvent.click(screen.getByRole('button', { name: 'Continue with offline resident' }));
  expect(f.onChoose).toHaveBeenCalledWith(
    {
      kind: 'new',
      profile: {
        displayName: 'New resident',
        email: 'resident@example.com',
        cnic: '3520212345671',
      },
    },
    'New resident',
    undefined,
  );
  expect(readStaffStays).not.toHaveBeenCalled();
  expect(screen.queryByText(id)).toBeNull();
});
it('SEC-003: invalid offline contact data emits no admission reference', () => {
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'New offline resident' }));
  fireEvent.change(screen.getByLabelText('Resident name'), { target: { value: 'Resident' } });
  fireEvent.change(screen.getByLabelText('Resident phone (optional)'), {
    target: { value: 'invalid' },
  });
  const form = screen
    .getByRole('button', { name: 'Continue with offline resident' })
    .closest('form');
  if (!form) throw Error('Resident form absent');
  fireEvent.submit(form);
  expect(screen.getByRole('alert')).toBeDefined();
  expect(f.onChoose).not.toHaveBeenCalled();
});
it('RES-001 / ACC-003: a named existing branch relationship emits its exact reference, never a new profile or account', async () => {
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Select Existing resident' }));
  expect(f.onChoose).toHaveBeenCalledWith(
    { kind: 'existing', residentId: other },
    'Existing resident',
  );
  expect(readStaffStays).toHaveBeenCalledWith({}, id, { limit: 20 });
  expect(screen.queryByText(other)).toBeNull();
});
it('RES-002: multiple stays for one relationship do not duplicate resident choices', async () => {
  vi.mocked(readStaffStays).mockResolvedValue({
    data: [row(), { ...row(), id: other }],
    nextCursor: null,
  });
  fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  expect(await screen.findAllByRole('button', { name: 'Select Existing resident' })).toHaveLength(
    1,
  );
});
it('RES-002: explicit bounded name search stays in the branch and removes stale choices', async () => {
  fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  await screen.findByRole('button', { name: 'Select Existing resident' });
  fireEvent.change(screen.getByLabelText('Find branch resident'), {
    target: { value: '  Garden  ' },
  });
  expect(readStaffStays).toHaveBeenCalledTimes(1);
  vi.mocked(readStaffStays).mockResolvedValue({ data: [], nextCursor: null });
  fireEvent.click(screen.getByRole('button', { name: 'Search branch residents' }));
  await screen.findByText('No matching resident relationships on this page.');
  expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20, q: 'Garden' });
  expect(screen.queryByRole('button', { name: 'Select Existing resident' })).toBeNull();
});
it('SEC-003: access loss and restoration clear private resident selection state', async () => {
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  await screen.findByRole('button', { name: 'Select Existing resident' });
  f.rerender(f.show({ ...f.props, unavailable: true }));
  expect(screen.queryByText('Existing resident')).toBeNull();
  f.rerender(f.show());
  expect(screen.queryByRole('button', { name: 'Select Existing resident' })).toBeNull();
  expect(f.onChoose).not.toHaveBeenCalled();
});
it('ACC-004: pending admission disables source changes, contact edits and cancellation', () => {
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'New offline resident' }));
  f.rerender(f.show({ ...f.props, pending: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel resident selection' }));
  expect(screen.getByLabelText('Resident name').closest('fieldset')?.disabled).toBe(true);
  expect(f.onChoose).not.toHaveBeenCalled();
  expect(f.onCancel).not.toHaveBeenCalled();
  expect(readStaffStays).not.toHaveBeenCalled();
});
it('SEC-003: a changed branch removes old private results and requires a new source choice', async () => {
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  await screen.findByRole('button', { name: 'Select Existing resident' });
  f.rerender(f.show({ ...f.props, branchId: other, branchLabel: 'Other branch' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Select Existing resident' })).toBeNull(),
  );
  expect(f.onChoose).not.toHaveBeenCalled();
});
it('RES-002: failed private lookup can retry without automatically selecting a relationship', async () => {
  vi.mocked(readStaffStays).mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'));
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Select Existing resident' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry branch residents' }));
  await screen.findByRole('button', { name: 'Select Existing resident' });
  expect(f.onChoose).not.toHaveBeenCalled();
});
it('RES-002: next and first pages carry only actual bounded branch continuation cursors', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
      ...row(),
      id: '10000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    })),
    cursor = rows.at(-1)?.id ?? null;
  vi.mocked(readStaffStays)
    .mockResolvedValueOnce({ data: rows, nextCursor: cursor })
    .mockResolvedValueOnce({ data: [], nextCursor: null });
  fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Existing branch resident' }));
  await screen.findByRole('button', { name: 'Select Existing resident' });
  fireEvent.click(screen.getByRole('button', { name: 'Next resident page' }));
  await screen.findByText('No matching resident relationships on this page.');
  expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20, cursor });
  fireEvent.click(screen.getByRole('button', { name: 'First resident page' }));
  await waitFor(() => expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20 }));
});
