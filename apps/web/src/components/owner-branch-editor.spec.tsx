import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readOwnerHostel, type ApiClient, type OwnerSetupActions } from '@hsm/api-client';
import type { HostelOnboarding } from '@hsm/contracts';
import { OwnerBranchEditor } from './owner-branch-editor';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readOwnerHostel: vi.fn(),
}));
vi.mock('./owner-geography', () => ({ OwnerGeography: () => <p>Named geography choices</p> }));
vi.mock('./owner-invitation', () => ({
  OwnerInvitation: () => <p>Optional Manager invitation</p>,
}));
vi.mock('./private-file-input', () => ({
  PrivateFileInput: ({ purpose }: { purpose: string }) => <p>Private upload: {purpose}</p>,
}));
vi.mock('./owner-manager-reset', () => ({ OwnerManagerReset: () => null }));
const brand = '550e8400-e29b-41d4-a716-446655440000';
function draft(): HostelOnboarding & { mainBranch: NonNullable<HostelOnboarding['mainBranch']> } {
  return {
    id: brand,
    organizationId: brand,
    name: 'Saved hostel',
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
      addressLine: 'Saved address',
      location: { latitude: 33.7, longitude: 73.04 },
      nearbyLandmark: null,
      description: 'Saved description',
      phone: null,
      showPublicContact: false,
      verificationStatus: 'draft',
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readOwnerHostel).mockResolvedValue(draft());
});
afterEach(cleanup);
function mount(extra: { section?: 'basics' | 'location' | 'review'; onSaved?: () => void } = {}) {
  const actions = {
    basics: vi.fn().mockResolvedValue({}),
    main: vi.fn().mockResolvedValue({}),
    submit: vi.fn().mockResolvedValue({}),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerBranchEditor
        userId="owner"
        brandId={brand}
        client={{} as ApiClient}
        actions={actions as unknown as OwnerSetupActions}
        {...extra}
      />
    </QueryClientProvider>,
  );
  return { actions, user: userEvent.setup() };
}
it('ONB-001: saved main-branch progress is editable and retained after saving partial details', async () => {
  const q = mount();
  const address = await screen.findByLabelText<HTMLInputElement>('Complete branch address');
  expect(address.value).toBe('Saved address');
  expect(screen.getByText('Private upload: listing_photo')).toBeDefined();
  await q.user.clear(address);
  await q.user.click(address);
  await q.user.paste('Updated branch address');
  await q.user.click(screen.getByRole('button', { name: 'Save main branch' }));
  await screen.findByText('Main branch saved.');
  expect(q.actions.main).toHaveBeenCalledWith(
    brand,
    expect.objectContaining({
      addressLine: 'Updated branch address',
      cityId: brand,
      areaId: brand,
      location: { latitude: 33.7, longitude: 73.04 },
    }),
  );
  expect(address.value).toBe('Updated branch address');
  expect(readOwnerHostel).toHaveBeenCalledTimes(2);
});
it('ONB-001: saved hostel basics use the scoped mutation and keep the edited name', async () => {
  const q = mount();
  const name = await screen.findByLabelText<HTMLInputElement>('Hostel name');
  await q.user.clear(name);
  await q.user.click(name);
  await q.user.paste('Updated hostel');
  await q.user.click(screen.getByRole('button', { name: 'Save hostel basics' }));
  await screen.findByText('Hostel basics saved.');
  expect(q.actions.basics).toHaveBeenCalledWith(
    brand,
    expect.objectContaining({ name: 'Updated hostel' }),
  );
  expect(name.value).toBe('Updated hostel');
});
it('ONB-001: incomplete drafts cannot submit for verification', async () => {
  vi.mocked(readOwnerHostel).mockResolvedValue({ ...draft(), missingFields: ['location'] });
  const q = mount();
  const submit = await screen.findByRole<HTMLButtonElement>('button', {
    name: 'Submit for verification',
  });
  expect(submit.disabled).toBe(true);
  await q.user.click(submit);
  expect(q.actions.submit).not.toHaveBeenCalled();
});
it('ONB-001: complete submission refreshes the review state and closes draft editing', async () => {
  vi.mocked(readOwnerHostel)
    .mockResolvedValueOnce(draft())
    .mockResolvedValue({
      ...draft(),
      mainBranch: { ...draft().mainBranch, verificationStatus: 'submitted' },
    });
  const q = mount();
  await q.user.click(await screen.findByRole('button', { name: 'Submit for verification' }));
  await screen.findByText('Status: submitted');
  expect(q.actions.submit).toHaveBeenCalledWith(brand);
  expect(screen.queryByLabelText('Hostel name')).toBeNull();
  expect(screen.getByText('Optional Manager invitation')).toBeDefined();
});
it('SEC: failed reads expose no stored fields or provider details and retry only the same draft', async () => {
  vi.mocked(readOwnerHostel).mockRejectedValueOnce(new Error('private storage detail'));
  const q = mount();
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to load this hostel.');
  expect(screen.queryByLabelText('Hostel name')).toBeNull();
  expect(document.body.textContent).not.toContain('private storage detail');
  await q.user.click(screen.getByRole('button', { name: 'Retry hostel' }));
  await screen.findByLabelText('Hostel name');
  expect(readOwnerHostel).toHaveBeenLastCalledWith({}, brand);
});
it('HSM-SETUP: a wizard section shows only its part and reports the save', async () => {
  const onSaved = vi.fn();
  const q = mount({ section: 'basics', onSaved });
  await screen.findByLabelText('Hostel name');
  expect(screen.queryByLabelText('Complete branch address')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Submit for verification' })).toBeNull();
  expect(screen.queryByText('Optional Manager invitation')).toBeNull();
  await q.user.click(screen.getByRole('button', { name: 'Save hostel basics' }));
  await screen.findByText('Hostel basics saved.');
  expect(onSaved).toHaveBeenCalledTimes(1);
});
it('HSM-SETUP: the review section keeps the submit gate and Manager tools', async () => {
  mount({ section: 'review' });
  await screen.findByRole('button', { name: 'Submit for verification' });
  expect(screen.queryByLabelText('Hostel name')).toBeNull();
  expect(screen.getByText('Optional Manager invitation')).toBeDefined();
});
