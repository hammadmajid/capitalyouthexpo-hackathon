import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  decideHostelRevision,
  listHostelRevisions,
  readHostelRevision,
  readHostelRevisionReview,
  readOwnerHostel,
  saveHostelRevision,
  submitHostelRevision,
  withdrawHostelRevision,
  type ApiClient,
  type OwnerSetupActions,
} from '@hsm/api-client';
import type { HostelOnboarding, HostelRevision } from '@hsm/contracts';
import { HostelRevisionOperations } from '../platform/admin-hostel-revisions';
import { RevisionStep } from '../setup-wizard/revision-step';
import { changedFields, revisionRows, revisionValue, withRevision } from './revision-fields';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readOwnerHostel: vi.fn(),
  readHostelRevision: vi.fn(),
  saveHostelRevision: vi.fn(),
  submitHostelRevision: vi.fn(),
  withdrawHostelRevision: vi.fn(),
  listHostelRevisions: vi.fn(),
  readHostelRevisionReview: vi.fn(),
  decideHostelRevision: vi.fn(),
}));
vi.mock('../owner-geography', () => ({ OwnerGeography: () => null }));
vi.mock('../owner-invitation', () => ({ OwnerInvitation: () => null }));
vi.mock('../owner-manager-reset', () => ({ OwnerManagerReset: () => null }));
vi.mock('../private-file-input', () => ({ PrivateFileInput: () => null }));
vi.mock('../platform/admin-operations', async (original) => ({
  ...(await original<typeof import('../platform/admin-operations')>()),
  useOperationScope: () => ({
    key: ['admin-test'],
    read: (work: (client: ApiClient) => Promise<unknown>) => work({} as ApiClient),
  }),
}));
const brand = '550e8400-e29b-41d4-a716-446655440000',
  place = '650e8400-e29b-41d4-a716-446655440000',
  revisionId = '750e8400-e29b-41d4-a716-446655440000';
function live(): HostelOnboarding {
  return {
    id: brand,
    organizationId: brand,
    name: 'Live hostel',
    logoFileId: null,
    missingFields: [],
    mainBranch: {
      id: brand,
      name: 'Main branch',
      isPrimary: true,
      category: 'boys',
      cityId: brand,
      areaId: brand,
      subAreaId: null,
      addressLine: 'Live address',
      location: { latitude: 33.7, longitude: 73.04 },
      nearbyLandmark: null,
      description: 'About',
      phone: null,
      showPublicContact: false,
      verificationStatus: 'approved',
    },
  };
}
function revision(status: HostelRevision['status'], changes = {}): HostelRevision {
  return {
    id: revisionId,
    brandId: brand,
    status,
    changes: { basics: null, main: null, ...changes },
    version: 3,
    submittedAt: status === 'submitted' ? '2026-11-20T10:00:00.000Z' : null,
    decidedAt: null,
    decisionNote: null,
  } as HostelRevision;
}
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
function step(name: 'basics' | 'location' | 'review', actions = {}) {
  wrap(
    <RevisionStep
      actorId="owner"
      brandId={brand}
      step={name}
      client={{} as ApiClient}
      actions={actions as OwnerSetupActions}
      next={() => undefined}
    />,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readOwnerHostel).mockResolvedValue(live());
});
afterEach(cleanup);
it('CHG-041: rows compare live and proposed values, with places by name', () => {
  const pending = revision('submitted', {
    main: { ...live().mainBranch, name: 'Live hostel', areaId: place, addressLine: 'New address' },
  });
  const rows = revisionRows({ live: live(), revision: pending });
  expect(rows.map((row) => row.label)).toEqual(['Area', 'Address']);
  expect(revisionValue('areaId', place, { [place]: 'G-11' })).toBe('G-11');
  expect(revisionValue('location', { latitude: 33.7, longitude: 73.04 })).toBe(
    '33.70000, 73.04000',
  );
  expect(changedFields(live(), pending)).toEqual(['Area', 'Address']);
  expect(withRevision(live(), pending).mainBranch?.addressLine).toBe('New address');
});
it('CHG-041: an approved hostel saves basics into a revision, not the live hostel', async () => {
  vi.mocked(readHostelRevision).mockResolvedValue({ live: live(), revision: null });
  vi.mocked(saveHostelRevision).mockResolvedValue({ live: live(), revision: revision('draft') });
  const actions = { basics: vi.fn(), main: vi.fn(), submit: vi.fn() };
  const user = userEvent.setup();
  step('basics', actions);
  const name = await screen.findByLabelText<HTMLInputElement>('Hostel name');
  await user.clear(name);
  await user.type(name, 'Renamed hostel');
  await user.click(screen.getByRole('button', { name: 'Save hostel basics' }));
  await waitFor(() => expect(saveHostelRevision).toHaveBeenCalledTimes(1));
  const [, sentBrand, body] = vi.mocked(saveHostelRevision).mock.calls[0] ?? [];
  expect(sentBrand).toBe(brand);
  expect(body).toMatchObject({ expectedVersion: null, basics: { name: 'Renamed hostel' } });
  expect(actions.basics).not.toHaveBeenCalled();
});
it('CHG-041: unsent edits reopen in the form and are sent with their version', async () => {
  const draft = revision('draft', { basics: { name: 'Pending name' } });
  vi.mocked(readHostelRevision).mockResolvedValue({ live: live(), revision: draft });
  vi.mocked(submitHostelRevision).mockResolvedValue({
    live: live(),
    revision: revision('submitted'),
  });
  step('basics');
  expect((await screen.findByLabelText<HTMLInputElement>('Hostel name')).value).toBe(
    'Pending name',
  );
  cleanup();
  const user = userEvent.setup();
  step('review');
  expect(await screen.findByText('Changed: Name')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Send for re-verification' }));
  await waitFor(() =>
    expect(vi.mocked(submitHostelRevision).mock.calls[0]?.slice(1, 3)).toEqual([
      brand,
      { expectedVersion: 3 },
    ]),
  );
});
it('CHG-041: while HSM reviews changes the forms stay closed and can be withdrawn', async () => {
  vi.mocked(readHostelRevision).mockResolvedValue({
    live: live(),
    revision: revision('submitted', { basics: { name: 'Pending name' } }),
  });
  vi.mocked(withdrawHostelRevision).mockResolvedValue({ live: live(), revision: null });
  const user = userEvent.setup();
  step('location');
  expect(await screen.findByText('Waiting for HSM review')).toBeTruthy();
  expect(screen.queryByLabelText('Complete branch address')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Withdraw changes' }));
  await waitFor(() =>
    expect(vi.mocked(withdrawHostelRevision).mock.calls[0]?.[2]).toEqual({ expectedVersion: 3 }),
  );
});
it('ADM-007: a verification admin rejects changes only with a confirmed reason', async () => {
  vi.mocked(listHostelRevisions).mockResolvedValue({
    data: [
      {
        id: revisionId,
        brandId: brand,
        branchId: brand,
        branchName: 'Main branch',
        organizationName: 'Org',
        submittedAt: '2026-11-20T10:00:00.000Z',
      },
    ],
    nextCursor: null,
  });
  vi.mocked(readHostelRevisionReview).mockResolvedValue({
    revision: revision('submitted', {
      main: { ...live().mainBranch, name: 'Live hostel', areaId: place },
    }),
    branchName: 'Main branch',
    organizationName: 'Org',
    live: live(),
    placeNames: { [brand]: 'F-7', [place]: 'G-11' },
  });
  vi.mocked(decideHostelRevision).mockResolvedValue(revision('rejected'));
  const user = userEvent.setup();
  wrap(<HostelRevisionOperations actorId="admin" />);
  await user.click(await screen.findByRole('button', { name: /Review Main branch · Org/ }));
  expect(await screen.findByText('Now: F-7')).toBeTruthy();
  expect(screen.getByText('New: G-11')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Reject changes' }));
  const confirm = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Confirm reject changes',
  });
  expect(confirm.disabled).toBe(true);
  await user.type(screen.getByLabelText('Reason for rejecting'), 'Address does not match');
  await user.click(confirm);
  await waitFor(() => expect(decideHostelRevision).toHaveBeenCalledTimes(1));
  expect(vi.mocked(decideHostelRevision).mock.calls[0]?.slice(1, 3)).toEqual([
    revisionId,
    { expectedVersion: 3, action: 'reject', reason: 'Address does not match' },
  ]);
});
