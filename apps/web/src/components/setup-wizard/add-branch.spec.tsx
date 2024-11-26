import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  branchPaymentInstructions,
  listListingGallery,
  listStaff,
  ownerBranchSetupActions,
  readApi,
  readBillingSettings,
  readBranchInventory,
  readListingSettings,
  readOwnerBranchSetup,
  readOwnerHostel,
  readVisitingHours,
  type ApiClient,
  type OwnerSetupActions,
} from '@hsm/api-client';
import type { HostelOnboarding } from '@hsm/contracts';
import { SetupWizard } from './setup-wizard';
vi.mock('../../lib/client', () => ({ browserClient: () => ({ GET: vi.fn() }) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readApi: vi.fn(),
  ownerBranchSetupActions: vi.fn(),
  readOwnerHostel: vi.fn(),
  readOwnerBranchSetup: vi.fn(),
  readBranchInventory: vi.fn(),
  listListingGallery: vi.fn(),
  readListingSettings: vi.fn(),
  readBillingSettings: vi.fn(),
  listStaff: vi.fn(),
  readVisitingHours: vi.fn(),
  branchPaymentInstructions: vi.fn(),
}));
vi.mock('../owner-geography', () => ({ OwnerGeography: () => null }));
vi.mock('../owner-invitation', () => ({ OwnerInvitation: () => null }));
vi.mock('../owner-manager-reset', () => ({ OwnerManagerReset: () => null }));
vi.mock('../private-file-input', () => ({ PrivateFileInput: () => <p>Logo upload</p> }));
const brand = '550e8400-e29b-41d4-a716-446655440000',
  main = '550e8400-e29b-41d4-a716-446655440001',
  other = '550e8400-e29b-41d4-a716-446655440002',
  added = '550e8400-e29b-41d4-a716-446655440003';
function draft(branchId: string, name: string, status: string, missingFields: string[] = []) {
  return {
    id: brand,
    organizationId: brand,
    name: 'Saved hostel',
    logoFileId: null,
    missingFields,
    mainBranch: {
      id: branchId,
      name,
      isPrimary: branchId === main,
      category: 'boys',
      cityId: brand,
      areaId: brand,
      subAreaId: null,
      addressLine: 'Street 1',
      location: { latitude: 33.7, longitude: 73.04 },
      nearbyLandmark: null,
      description: null,
      phone: null,
      showPublicContact: false,
      verificationStatus: status,
    },
  } as HostelOnboarding;
}
function summary(id: string, name: string, verificationStatus: string) {
  return { id, organizationId: brand, brandId: brand, name, verificationStatus };
}
const branchApi = { add: vi.fn(), save: vi.fn(), submit: vi.fn() };
const actions = { basics: vi.fn(), main: vi.fn(), submit: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ownerBranchSetupActions).mockReturnValue(branchApi as never);
  vi.mocked(readOwnerHostel).mockResolvedValue(draft(main, 'Main branch', 'submitted'));
  vi.mocked(readApi).mockResolvedValue({
    data: [summary(main, 'Main branch', 'submitted'), summary(other, 'Saddar branch', 'draft')],
    nextCursor: null,
  });
  vi.mocked(readBranchInventory).mockResolvedValue({ rooms: [] } as never);
  vi.mocked(listListingGallery).mockResolvedValue({ data: [], nextCursor: null } as never);
  vi.mocked(readListingSettings).mockResolvedValue({ amenities: [] } as never);
  vi.mocked(readBillingSettings).mockResolvedValue({ effectiveVersion: null } as never);
  vi.mocked(listStaff).mockResolvedValue({ data: [], nextCursor: null } as never);
  vi.mocked(readVisitingHours).mockResolvedValue({ windows: [] } as never);
  vi.mocked(branchPaymentInstructions).mockResolvedValue({ data: [] } as never);
});
afterEach(cleanup);
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SetupWizard
        actorId="owner"
        brandId={brand}
        client={{} as ApiClient}
        actions={actions as unknown as OwnerSetupActions}
        leave={() => undefined}
      />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it('BRN-001: a new branch keeps the hostel name, is created by its first save, then continues', async () => {
  branchApi.add.mockResolvedValue({ id: brand, mainBranchId: added });
  branchApi.save.mockResolvedValue({ id: brand, mainBranchId: added });
  vi.mocked(readOwnerBranchSetup).mockResolvedValue(draft(added, 'New branch', 'draft'));
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'Add branch' }));
  await user.click(screen.getByRole('button', { name: 'Start the new branch' }));
  expect(await screen.findByText('Branch of Saved hostel')).toBeTruthy();
  expect(screen.queryByLabelText('Hostel name')).toBeNull();
  expect(screen.queryByText('Logo upload')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Save branch basics' }));
  await waitFor(() => expect(branchApi.add).toHaveBeenCalledTimes(1));
  expect(branchApi.add.mock.calls[0]).toEqual([
    brand,
    expect.objectContaining({ name: 'New branch', category: 'boys' }),
  ]);
  expect(actions.basics).not.toHaveBeenCalled();
  const branchName = await screen.findByLabelText<HTMLInputElement>('Branch name');
  expect(readOwnerBranchSetup).toHaveBeenCalledWith({}, brand, added);
  await user.clear(branchName);
  await user.type(branchName, 'Saddar branch');
  await user.click(screen.getByRole('button', { name: 'Save branch location' }));
  await waitFor(() => expect(branchApi.save).toHaveBeenCalledTimes(1));
  expect(branchApi.save.mock.calls[0]).toEqual([
    brand,
    added,
    expect.objectContaining({ name: 'Saddar branch', addressLine: 'Street 1' }),
  ]);
  expect(actions.main).not.toHaveBeenCalled();
});
it('BRN-001: an existing branch reopens its own setup and submits on its own', async () => {
  vi.mocked(readOwnerBranchSetup).mockResolvedValue(draft(other, 'Saddar branch', 'draft'));
  branchApi.submit.mockResolvedValue({ id: brand, mainBranchId: other });
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'Continue Saddar branch setup' }));
  expect(await screen.findByRole('heading', { name: 'Branch Setup' })).toBeTruthy();
  expect(screen.getByText(/Saved hostel · Saddar branch/)).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Branches' })).toBeNull();
  await user.click(screen.getByRole('button', { name: /Review & Submit/ }));
  await user.click(await screen.findByRole('button', { name: 'Submit for verification' }));
  await waitFor(() => expect(branchApi.submit).toHaveBeenCalledWith(brand, other));
  expect(actions.submit).not.toHaveBeenCalled();
});
it('BRN-001: more branches are offered only after the main branch was submitted', async () => {
  vi.mocked(readOwnerHostel).mockResolvedValue(draft(main, 'Main branch', 'draft', ['area']));
  mount();
  expect(await screen.findByText('Submit the main branch to add more branches.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add branch' })).toBeNull();
});
