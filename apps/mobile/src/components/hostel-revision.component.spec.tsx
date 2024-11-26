/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readHostelRevision, submitHostelRevision } from '@hsm/api-client';
import type { HostelOnboarding, HostelRevision, HostelRevisionReview } from '@hsm/contracts';
import { OwnerRevisionPanel, changedFields } from './owner-revision-panel';
import { revisionRows } from './admin/hostel-revision-review';
import { usesRevision, withRevision } from './use-hostel-revision';
import { setupStepLocked } from './use-owner-draft';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readHostelRevision: jest.fn(),
  submitHostelRevision: jest.fn(),
  withdrawHostelRevision: jest.fn(),
  saveHostelRevision: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000099' }));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('../lib/fresh-session', () => ({
  withFreshSession: (work: () => Promise<unknown>) => work(),
}));
jest.mock('./admin/data', () => ({ useAdminCommand: jest.fn(), useAdminData: jest.fn() }));
const brand = '10000000-0000-4000-8000-000000000001',
  branch = '10000000-0000-4000-8000-000000000002';
const live: HostelOnboarding = {
  id: brand,
  organizationId: '10000000-0000-4000-8000-000000000003',
  name: 'Live hostel',
  logoFileId: null,
  missingFields: [],
  mainBranch: {
    id: branch,
    name: 'Live hostel',
    isPrimary: true,
    category: 'boys',
    cityId: null,
    areaId: null,
    subAreaId: null,
    addressLine: 'Street 1',
    location: null,
    nearbyLandmark: null,
    description: 'Old about',
    phone: null,
    showPublicContact: false,
    verificationStatus: 'approved',
  },
};
const draft: HostelRevision = {
  id: '10000000-0000-4000-8000-000000000004',
  brandId: brand,
  branchId: branch,
  status: 'draft',
  changes: { basics: { name: 'New name', description: 'Old about' }, main: null },
  version: 2,
  submittedAt: null,
  decidedAt: null,
  decisionNote: null,
  updatedAt: '2026-11-15T10:00:00.000Z',
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OwnerRevisionPanel actorId="owner" brandId={brand} />
    </QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());
it('CHG-041: only an approved main branch is edited through pending changes', () => {
  expect(usesRevision(live)).toBe(true);
  expect(usesRevision(live, branch)).toBe(false);
  expect(
    usesRevision({
      ...live,
      mainBranch: live.mainBranch ? { ...live.mainBranch, verificationStatus: 'draft' } : null,
    }),
  ).toBe(false);
  const shown = withRevision(live, draft);
  expect(shown.name).toBe('New name');
  expect(shown.mainBranch?.description).toBe('Old about');
});
it('CHG-041: only fields that really differ are listed, for the Owner and the Admin', () => {
  expect(changedFields(live, draft)).toEqual(['Name']);
  const review: HostelRevisionReview = {
    revision: { ...draft, status: 'submitted', submittedAt: draft.updatedAt },
    branchName: 'Live hostel',
    organizationName: 'Org',
    live,
  };
  expect(revisionRows(review)).toEqual([
    { key: 'name', label: 'Name', now: 'Live hostel', next: 'New name' },
  ]);
});
it('CHG-041: unsent changes can be sent for re-verification with their version', async () => {
  jest.mocked(readHostelRevision).mockResolvedValue({ live, revision: draft });
  jest
    .mocked(submitHostelRevision)
    .mockResolvedValue({ live, revision: { ...draft, status: 'submitted', version: 3 } });
  await mount();
  expect(await screen.findByText('Unsent changes')).toBeTruthy();
  expect(screen.getByText('Changed: Name')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Send for re-verification' }));
  await waitFor(() => expect(submitHostelRevision).toHaveBeenCalled());
  expect(jest.mocked(submitHostelRevision).mock.calls[0]?.[2]).toEqual({ expectedVersion: 2 });
});
it('CHG-041: a rejected change shows the HSM reason and the live hostel stays', async () => {
  jest.mocked(readHostelRevision).mockResolvedValue({
    live,
    revision: { ...draft, status: 'rejected', decisionNote: 'Name unclear' },
  });
  await mount();
  expect(await screen.findByText('Last changes not approved')).toBeTruthy();
  expect(screen.getByText('Name unclear')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send for re-verification' })).toBeNull();
});

it('CHG-041: an approved branch keeps rooms, photos and staff editable; name and location stay locked', () => {
  for (const step of ['rooms', 'photos', 'amenities', 'policies', 'visits', 'staff', 'review'])
    expect(setupStepLocked(live, step)).toBe(false);
  expect(setupStepLocked(live, 'basics')).toBe(true);
  expect(setupStepLocked(live, 'location')).toBe(true);
  const waiting = {
    ...live,
    mainBranch: live.mainBranch ? { ...live.mainBranch, verificationStatus: 'submitted' } : null,
  } as HostelOnboarding;
  expect(setupStepLocked(waiting, 'rooms')).toBe(true);
  expect(setupStepLocked(waiting, 'review')).toBe(false);
});
