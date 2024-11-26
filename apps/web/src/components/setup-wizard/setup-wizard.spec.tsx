import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  branchPaymentInstructions,
  listListingGallery,
  listStaff,
  readBillingSettings,
  readBranchInventory,
  readListingSettings,
  readOwnerHostel,
  readVisitingHours,
  type ApiClient,
  type OwnerSetupActions,
} from '@hsm/api-client';
import type { HostelOnboarding } from '@hsm/contracts';
import { SetupWizard } from './setup-wizard';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readOwnerHostel: vi.fn(),
  readBranchInventory: vi.fn(),
  listListingGallery: vi.fn(),
  readListingSettings: vi.fn(),
  readBillingSettings: vi.fn(),
  listStaff: vi.fn(),
  readVisitingHours: vi.fn(),
  branchPaymentInstructions: vi.fn(),
}));
vi.mock('../owner-branch-editor', () => ({
  OwnerBranchEditor: (props: { section: string; onSaved: () => void }) => (
    <button type="button" onClick={props.onSaved}>
      Save {props.section}
    </button>
  ),
}));
vi.mock('../listing-settings', () => ({ ListingSettings: () => <p>Amenities editor</p> }));
vi.mock('../services/menu', () => ({ MenuEditor: () => <p>Menu editor</p> }));
vi.mock('../services/transport-routes-setup', () => ({
  TransportRoutesSetup: () => <p>Transport editor</p>,
}));
vi.mock('../setup/rooms-panel', () => ({ RoomsPanel: () => <p>Rooms editor</p> }));
vi.mock('../listing-gallery', () => ({ ListingGallery: () => <p>Photo editor</p> }));
const brand = '550e8400-e29b-41d4-a716-446655440000',
  branch = '550e8400-e29b-41d4-a716-446655440001';
function hostel(status: string, missingFields: string[] = []) {
  return {
    id: brand,
    organizationId: brand,
    name: 'Saved hostel',
    logoFileId: null,
    missingFields,
    mainBranch: { id: branch, isPrimary: true, verificationStatus: status },
  } as unknown as HostelOnboarding;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readOwnerHostel).mockResolvedValue(hostel('draft', ['area']));
  vi.mocked(readBranchInventory).mockResolvedValue({
    rooms: [{ archivedAt: null, seats: [{ archivedAt: null }, { archivedAt: null }] }],
  } as never);
  vi.mocked(listListingGallery).mockResolvedValue({ data: [], nextCursor: null } as never);
  vi.mocked(readListingSettings).mockResolvedValue({ amenities: [{ id: 'wifi' }] } as never);
  vi.mocked(readBillingSettings).mockResolvedValue({ effectiveVersion: null } as never);
  vi.mocked(listStaff).mockResolvedValue({ data: [], nextCursor: null } as never);
  vi.mocked(readVisitingHours).mockResolvedValue({ windows: [] } as never);
  vi.mocked(branchPaymentInstructions).mockResolvedValue({ data: [] } as never);
});
afterEach(cleanup);
function mount() {
  const leave = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SetupWizard
        actorId="owner"
        brandId={brand}
        client={{} as ApiClient}
        actions={{} as OwnerSetupActions}
        leave={leave}
      />
    </QueryClientProvider>,
  );
  return { leave, user: userEvent.setup() };
}
function card(title: string) {
  return screen.getByRole('button', { name: (name) => name.includes(title) });
}
it('HSM-SETUP: the overview shows saved server progress for every step', async () => {
  mount();
  await screen.findByText(/2 beds saved/);
  expect(within(card('Basic Information')).getByText('Saved')).toBeTruthy();
  expect(within(card('Location & Address')).getByText('Required')).toBeTruthy();
  expect(within(card('Amenities & Services')).getByText('Saved')).toBeTruthy();
  expect(within(card('Photos & Gallery')).getByText('Optional')).toBeTruthy();
  expect(within(card('Building & Rooms')).getByText('Saved')).toBeTruthy();
  expect(card('Location & Address').getAttribute('aria-current')).toBe('step');
});
it('HSM-SETUP: Continue resumes at the first unsaved step and saving moves to the next', async () => {
  const q = mount();
  await screen.findByText(/2 beds saved/);
  await q.user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Step 2 of 10')).toBeTruthy();
  await q.user.click(screen.getByRole('button', { name: 'Save location' }));
  expect(screen.getByRole('heading', { name: 'Amenities & Services' })).toBeTruthy();
  expect(screen.getByText('Amenities editor')).toBeTruthy();
  expect(screen.getByText('Menu editor')).toBeTruthy();
  expect(screen.getByText('Transport editor')).toBeTruthy();
});
it('HSM-SETUP: optional steps skip forward; Back walks one step and step 1 returns to all steps', async () => {
  const q = mount();
  await screen.findByText(/2 beds saved/);
  await q.user.click(card('Photos & Gallery'));
  expect(screen.getByText('Photo editor')).toBeTruthy();
  await q.user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByRole('heading', { name: 'Visiting Hours' })).toBeTruthy();
  await q.user.click(screen.getByRole('button', { name: 'All steps' }));
  await q.user.click(card('Basic Information'));
  expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  await q.user.click(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByRole('heading', { name: 'Hostel Setup' })).toBeTruthy();
});
it('CHG-041: a submitted draft locks its steps until HSM requests changes', async () => {
  vi.mocked(readOwnerHostel).mockResolvedValue(hostel('submitted'));
  const q = mount();
  expect(await screen.findByText('Submitted for verification')).toBeTruthy();
  await q.user.click(screen.getByRole('button', { name: 'Review status' }));
  expect(screen.getByRole('button', { name: 'Save review' })).toBeTruthy();
  await q.user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('Submitted · locked until HSM requests changes.')).toBeTruthy();
  expect(screen.queryByText('Save staff')).toBeNull();
});
it('SEC: a failed draft read shows no details and retries the same hostel', async () => {
  vi.mocked(readOwnerHostel).mockRejectedValueOnce(new Error('private storage detail'));
  const q = mount();
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to load this hostel.');
  expect(document.body.textContent).not.toContain('private storage detail');
  await q.user.click(screen.getByRole('button', { name: 'Retry hostel' }));
  expect(await screen.findByText(/2 beds saved/)).toBeTruthy();
  expect(readOwnerHostel).toHaveBeenLastCalledWith({}, brand);
});
